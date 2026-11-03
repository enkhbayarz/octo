import type { Localized } from '@/i18n';

/** A phrase being learned: the English and its Mongolian meaning. Course material, not UI. */
export type Phrase = {
  en: string;
  mn: string;
};

export type Lesson = {
  id: string;
  title: Localized;
  description: Localized;
  videoUrl: string;
  durationSec: number;
  phrases: Phrase[];
};

/** Quiz items are course material (Mongolian ↔ English), so they aren't localized. */
export type Question = {
  text: string;
  options: string[];
  answerIndex: number;
};

export type Quiz = {
  id: string;
  /** Minimum score, in percent, needed to pass and unlock the next unit. */
  passPercent: number;
  questions: Question[];
};

export type Unit = {
  id: string;
  title: Localized;
  lessons: Lesson[];
  quiz: Quiz;
};

/** A unit announced on the path but without content yet. */
export type UpcomingUnit = {
  id: string;
  title: Localized;
  lessonTitles: Localized[];
};

export type Course = {
  id: string;
  title: Localized;
  shortTitle: Localized;
  units: Unit[];
  upcomingUnits: UpcomingUnit[];
};

/**
 * One stop on the learning path. Lessons and quizzes share a single ordered
 * list, so "unlock the next item" is the same rule for both.
 */
export type PathItem =
  | {
      kind: 'lesson';
      id: string;
      unitIndex: number;
      indexInUnit: number;
      unit: Unit;
      lesson: Lesson;
    }
  | {
      kind: 'quiz';
      id: string;
      unitIndex: number;
      unit: Unit;
      quiz: Quiz;
    };
