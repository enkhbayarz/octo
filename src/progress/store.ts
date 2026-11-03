import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { findPathItem } from '@/course';
import { today } from '@/lib/dates';

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
  submitQuiz: (quizId: string, answers: readonly boolean[]) => QuizOutcome;
  reset: () => void;
};

/**
 * The learner's progress, persisted to AsyncStorage so it survives app restarts.
 * Actions delegate to the pure rules in `rules.ts`; the store only wires them up.
 */
export const useProgress = create<Progress & ProgressActions>()(
  persist(
    (set, get) => ({
      ...createProgress(today()),

      setLearnerName: (input) => {
        const learnerName = normalizeName(input);
        if (learnerName) set({ learnerName });
      },

      setAnswers: (answers) => set({ answers }),

      saveVideoProgress: (lessonId, position, furthest) =>
        set(saveVideoProgress(get(), lessonId, position, furthest)),

      completeLesson: (lessonId) => {
        const { progress, outcome } = completeLesson(get(), lessonId, today());
        set(progress);
        return outcome;
      },

      submitQuiz: (quizId, answers) => {
        const item = findPathItem(quizId);
        if (item?.kind !== 'quiz') throw new Error(`Unknown quiz: ${quizId}`);
        const { progress, outcome } = recordQuizAttempt(get(), item.quiz, answers, today());
        set(progress);
        return outcome;
      },

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
