import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { findPathItem } from '@/course';
import { today } from '@/lib/dates';
import { createId } from '@/lib/id';
import type { ServerProfile, ServerProgress } from '@/sync/api';
import { applyServer } from '@/sync/merge';
import { useSync } from '@/sync/store';

import {
  completeLesson,
  createProgress,
  normalizeName,
  recordQuizAttempt,
  saveVideoProgress,
} from './rules';
import type { LessonOutcome, OnboardingAnswers, Progress, QuizOutcome } from './types';

type ProgressActions = {
  setLearnerName: (name: string) => void;
  setAnswers: (answers: OnboardingAnswers) => void;
  saveVideoProgress: (lessonId: string, position: number, furthest: number) => void;
  completeLesson: (lessonId: string) => LessonOutcome;
  /** `choices`: the option picked for each question, in order. */
  submitQuiz: (quizId: string, choices: readonly number[]) => QuizOutcome;
  /** Merges the signed-in account's progress (see sync/merge). */
  applyServer: (server: ServerProgress, profile: ServerProfile) => void;
  reset: () => void;
};

/** Signed-in learners' changes also go to the outbox; for guests this is a no-op. */
const outbox = () => useSync.getState();

/**
 * The learner's progress, persisted to AsyncStorage so it survives app restarts.
 * Actions delegate to the pure rules in `rules.ts`; the store only wires them up.
 * It stays the source of truth for the UI (instant, works offline); when signed
 * in, each change is also queued for the API (see `src/sync`).
 */
export const useProgress = create<Progress & ProgressActions>()(
  persist(
    (set, get) => ({
      ...createProgress(today()),

      setLearnerName: (input) => {
        const learnerName = normalizeName(input);
        if (!learnerName) return;
        set({ learnerName });
        outbox().enqueue({ kind: 'profile', displayName: learnerName });
      },

      setAnswers: (answers) => {
        set({ answers });
        outbox().enqueue({ kind: 'profile', onboarding: answers });
      },

      saveVideoProgress: (lessonId, position, furthest) => {
        const before = get();
        const progress = saveVideoProgress(before, lessonId, position, furthest);
        if (progress === before) return;
        set(progress);
        const saved = progress.videoProgress[lessonId];
        if (saved) {
          outbox().enqueue({
            kind: 'video',
            lessonId,
            positionSec: saved.position,
            furthestSec: saved.furthest,
          });
        }
      },

      completeLesson: (lessonId) => {
        const { progress, outcome } = completeLesson(get(), lessonId, today());
        set(progress);
        if (outcome.xpGained > 0) outbox().enqueue({ kind: 'lesson', lessonId });
        return outcome;
      },

      submitQuiz: (quizId, choices) => {
        const item = findPathItem(quizId);
        if (item?.kind !== 'quiz') throw new Error(`Unknown quiz: ${quizId}`);
        const correct = choices.map(
          (choice, index) => choice === item.quiz.questions[index]?.answerIndex,
        );
        const { progress, outcome } = recordQuizAttempt(get(), item.quiz, correct, today());
        set(progress);
        // The key makes a resend after a lost response replay, not count twice.
        outbox().enqueue({ kind: 'quiz', quizId, answers: [...choices], key: createId() });
        return outcome;
      },

      applyServer: (server, profile) => set(applyServer(get(), server, profile)),

      reset: () => set(createProgress(today())),
    }),
    {
      name: 'octolearn.progress',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        setLearnerName,
        setAnswers,
        saveVideoProgress,
        completeLesson,
        submitQuiz,
        applyServer,
        reset,
        ...progress
      }) => progress,
      // v1 had no video positions; fill in defaults so older saves keep working.
      migrate: (persisted) => ({ ...createProgress(today()), ...(persisted as Partial<Progress>) }),
    },
  ),
);

const subscribeToHydration = (onChange: () => void) =>
  useProgress.persist.onFinishHydration(onChange);

/** True once saved progress has been read from disk. The splash screen stays up until then. */
export function useProgressHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => useProgress.persist.hasHydrated());
}
