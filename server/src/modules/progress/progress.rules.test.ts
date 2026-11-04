import { describe, expect, test } from 'vitest';

import type { CourseTree } from '../course/course.schemas.js';
import {
  advanceStreak,
  buildPath,
  currentStreak,
  findLesson,
  findQuiz,
  gradeQuiz,
  isPassingScore,
  isUnlocked,
} from './progress.rules.js';

const text = { mn: 'мн', en: 'en' };
const lesson = (id: string) => ({
  id,
  title: text,
  description: text,
  videoUrl: 'https://v',
  durationSec: 10,
  phrases: [],
});
const course: CourseTree = {
  id: 'c',
  title: text,
  shortTitle: text,
  units: [
    {
      id: 'u1',
      title: text,
      lessons: [lesson('u1-l1'), lesson('u1-l2')],
      quiz: {
        id: 'u1-quiz',
        passPercent: 60,
        questions: [{ id: 'q', text: '?', options: ['a', 'b'], answerIndex: 1 }],
      },
    },
    { id: 'u2', title: text, lessons: [lesson('u2-l1')], quiz: null },
  ],
};

describe('advanceStreak', () => {
  test('starts at 1 on the first activity', () => {
    expect(advanceStreak({ count: 0, lastDay: null }, '2026-11-04')).toEqual({
      streak: { count: 1, lastDay: '2026-11-04' },
      increased: true,
    });
  });

  test('grows on the day after the last activity, also across months', () => {
    expect(advanceStreak({ count: 4, lastDay: '2026-10-31' }, '2026-11-01').streak.count).toBe(5);
  });

  test('restarts after a missed day', () => {
    expect(advanceStreak({ count: 9, lastDay: '2026-11-01' }, '2026-11-03')).toEqual({
      streak: { count: 1, lastDay: '2026-11-03' },
      increased: true,
    });
  });

  test('a second activity the same day changes nothing', () => {
    const streak = { count: 3, lastDay: '2026-11-04' };
    expect(advanceStreak(streak, '2026-11-04')).toEqual({ streak, increased: false });
  });

  test('a day earlier than the last one (time-zone change) changes nothing', () => {
    const streak = { count: 3, lastDay: '2026-11-04' };
    expect(advanceStreak(streak, '2026-11-03')).toEqual({ streak, increased: false });
  });
});

describe('currentStreak', () => {
  test('is 0 before any activity', () => {
    expect(currentStreak({ count: 0, lastDay: null }, '2026-11-04')).toBe(0);
  });

  test('holds through the next day, lapses after that', () => {
    const streak = { count: 6, lastDay: '2026-11-03' };
    expect(currentStreak(streak, '2026-11-03')).toBe(6);
    expect(currentStreak(streak, '2026-11-04')).toBe(6);
    expect(currentStreak(streak, '2026-11-05')).toBe(0);
  });
});

describe('quiz scoring', () => {
  test('passes at exactly the pass percent', () => {
    expect(isPassingScore(3, 5, 60)).toBe(true);
    expect(isPassingScore(2, 5, 60)).toBe(false);
    expect(isPassingScore(0, 0, 60)).toBe(false);
  });

  test('counts answers matching the right option', () => {
    const questions = [{ answerIndex: 0 }, { answerIndex: 2 }, { answerIndex: 1 }];
    expect(gradeQuiz(questions, [0, 2, 0])).toEqual({ correct: 2, total: 3 });
  });
});

describe('learning path', () => {
  const path = buildPath(course);
  const none = { lessons: new Set<string>(), passedQuizzes: new Set<string>() };

  test("lists each unit's lessons, then its quiz", () => {
    expect(path.map((item) => item.id)).toEqual(['u1-l1', 'u1-l2', 'u1-quiz', 'u2-l1']);
  });

  test('opens an item once the one before it is done', () => {
    expect(isUnlocked(path, 'u1-l1', none)).toBe(true);
    expect(isUnlocked(path, 'u1-l2', none)).toBe(false);
    expect(isUnlocked(path, 'u1-l2', { ...none, lessons: new Set(['u1-l1']) })).toBe(true);
    expect(isUnlocked(path, 'missing', none)).toBe(false);
  });

  test("a unit's first lesson waits for the previous unit's quiz to be passed", () => {
    const lessonsDone = { lessons: new Set(['u1-l1', 'u1-l2']), passedQuizzes: new Set<string>() };
    expect(isUnlocked(path, 'u1-quiz', lessonsDone)).toBe(true);
    expect(isUnlocked(path, 'u2-l1', lessonsDone)).toBe(false);
    expect(isUnlocked(path, 'u2-l1', { ...lessonsDone, passedQuizzes: new Set(['u1-quiz']) })).toBe(
      true,
    );
  });

  test('finds lessons and quizzes by id', () => {
    expect(findLesson(course, 'u2-l1')?.id).toBe('u2-l1');
    expect(findLesson(course, 'nope')).toBeUndefined();
    expect(findQuiz(course, 'u1-quiz')?.passPercent).toBe(60);
    expect(findQuiz(course, 'u2-quiz')).toBeUndefined();
  });
});
