/**
 * How progress changes. Pure functions over plain data: no React, no storage,
 * and "today" is passed in, so every rule is unit-tested without a device.
 */
import type { Quiz } from '@/course';
import { addDays, type DayKey } from '@/lib/dates';

import type { LessonOutcome, Progress, QuizOutcome } from './types';

export const XP_PER_LESSON = 10;
export const XP_PER_QUIZ_PASS = 20;

export const MAX_NAME_LENGTH = 24;

export function createProgress(day: DayKey): Progress {
  return {
    learnerName: '',
    answers: null,
    joinedOn: day,
    completedLessons: {},
    quizResults: {},
    xp: 0,
    streak: { count: 0, lastActiveDay: null },
    activity: {},
    videoProgress: {},
  };
}

/** Trims and collapses spaces. Returns null when nothing usable is left or it's too long. */
export function normalizeName(input: string): string | null {
  const name = input.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Remembers where a lesson video was left. `furthest` never moves backwards. */
export function saveVideoProgress(
  progress: Progress,
  lessonId: string,
  position: number,
  furthest: number,
): Progress {
  if (progress.completedLessons[lessonId]) return progress;
  const previous = progress.videoProgress[lessonId];
  return {
    ...progress,
    videoProgress: {
      ...progress.videoProgress,
      [lessonId]: { position, furthest: Math.max(previous?.furthest ?? 0, furthest) },
    },
  };
}

/** Records learning on `day`. The streak grows on the first activity of a new consecutive day. */
function recordActivity(progress: Progress, day: DayKey, xp: number) {
  const { lastActiveDay, count } = progress.streak;
  const isNewDay = lastActiveDay !== day;
  const streak = !isNewDay
    ? progress.streak
    : { count: lastActiveDay === addDays(day, -1) ? count + 1 : 1, lastActiveDay: day };

  return {
    progress: {
      ...progress,
      xp: progress.xp + xp,
      streak,
      activity: { ...progress.activity, [day]: (progress.activity[day] ?? 0) + xp },
    },
    streakIncreased: isNewDay,
  };
}

export function completeLesson(
  progress: Progress,
  lessonId: string,
  day: DayKey,
): { progress: Progress; outcome: LessonOutcome } {
  if (progress.completedLessons[lessonId]) {
    // Re-watching a finished lesson is allowed but earns nothing.
    return { progress, outcome: { xpGained: 0, streakIncreased: false } };
  }

  const recorded = recordActivity(progress, day, XP_PER_LESSON);
  // A finished lesson replays from the start, so its resume point is dropped.
  const { [lessonId]: _finished, ...videoProgress } = progress.videoProgress;
  return {
    progress: {
      ...recorded.progress,
      completedLessons: { ...progress.completedLessons, [lessonId]: true },
      videoProgress,
    },
    outcome: { xpGained: XP_PER_LESSON, streakIncreased: recorded.streakIncreased },
  };
}

export function isPassingScore(correct: number, total: number, passPercent: number): boolean {
  return total > 0 && (correct / total) * 100 >= passPercent;
}

export function recordQuizAttempt(
  progress: Progress,
  quiz: Pick<Quiz, 'id' | 'passPercent'>,
  answers: readonly boolean[],
  day: DayKey,
): { progress: Progress; outcome: QuizOutcome } {
  const total = answers.length;
  const correct = answers.filter(Boolean).length;
  const passed = isPassingScore(correct, total, quiz.passPercent);
  const previous = progress.quizResults[quiz.id];
  // XP only for the first pass, so retakes can't farm points.
  const xpGained = passed && !previous?.passed ? XP_PER_QUIZ_PASS : 0;

  // Any attempt counts as learning for the streak, even a failed one.
  const recorded = recordActivity(progress, day, xpGained);
  return {
    progress: {
      ...recorded.progress,
      quizResults: {
        ...progress.quizResults,
        [quiz.id]: {
          best: Math.max(previous?.best ?? 0, correct),
          total,
          passed: passed || Boolean(previous?.passed),
          attempts: (previous?.attempts ?? 0) + 1,
        },
      },
    },
    outcome: { correct, total, passed, xpGained },
  };
}

/** The streak shown to the learner: it lapses if yesterday had no activity. */
export function currentStreak(progress: Progress, day: DayKey): number {
  const { lastActiveDay, count } = progress.streak;
  return lastActiveDay === day || lastActiveDay === addDays(day, -1) ? count : 0;
}
