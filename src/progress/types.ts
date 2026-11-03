import type { DayKey } from '@/lib/dates';

export type QuizResult = {
  /** Best number of correct answers across attempts. */
  best: number;
  total: number;
  /** Stays true once passed, even if a later retry scores lower. */
  passed: boolean;
  attempts: number;
};

/** Where a learner left a lesson video, in seconds. */
export type VideoProgress = {
  /** Resume point. */
  position: number;
  /** Furthest point reached; drives the 90% rule, so it survives leaving the lesson. */
  furthest: number;
};

/** Why the learner wants English, asked during onboarding. */
export type LearningReason = 'travel' | 'work' | 'school' | 'fun' | 'other';

/** How much English the learner says they know. */
export type EnglishLevel = 'new' | 'some' | 'basic';

/** Onboarding answers, kept so lessons and reminders can be personalized later. */
export type OnboardingAnswers = {
  reason: LearningReason;
  level: EnglishLevel;
  dailyMinutes: number;
};

/** Everything persisted on the device. Plain JSON so it survives AsyncStorage. */
export type Progress = {
  /** Empty until the learner enters it at the end of onboarding. */
  learnerName: string;
  /** Null until onboarding is answered. */
  answers: OnboardingAnswers | null;
  joinedOn: DayKey;
  completedLessons: Record<string, true>;
  quizResults: Record<string, QuizResult>;
  xp: number;
  streak: {
    count: number;
    lastActiveDay: DayKey | null;
  };
  /** XP earned per day, for the weekly chart. */
  activity: Record<DayKey, number>;
  /** Unfinished lessons only; cleared once a lesson is completed. */
  videoProgress: Record<string, VideoProgress>;
};

export type ItemStatus = 'done' | 'active' | 'locked';

export type LessonOutcome = {
  xpGained: number;
  streakIncreased: boolean;
};

export type QuizOutcome = {
  correct: number;
  total: number;
  passed: boolean;
  xpGained: number;
};
