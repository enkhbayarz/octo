import { describe, expect, test } from 'bun:test';

import { course, pathItems } from '@/course';

import { completeLesson, createProgress, recordQuizAttempt } from './rules';
import {
  getActiveItem,
  getCourseProgress,
  getItemStatus,
  getLockReason,
  getProfileStats,
  getWeeklyActivity,
} from './selectors';
import type { Progress } from './types';

const day = '2026-11-03';

function finishUnitOneLessons(): Progress {
  return ['u1-l1', 'u1-l2', 'u1-l3', 'u1-l4', 'u1-l5'].reduce(
    (progress, id) => completeLesson(progress, id, day).progress,
    createProgress(day),
  );
}

const statuses = (progress: Progress) =>
  pathItems.map((_, index) => getItemStatus(pathItems, index, progress));

describe('path status', () => {
  test('a new learner can only open the first lesson', () => {
    const [first, ...rest] = statuses(createProgress(day));
    expect(first).toBe('active');
    expect(rest.every((status) => status === 'locked')).toBe(true);
  });

  test('finishing a unit’s lessons opens its quiz but not the next unit', () => {
    const progress = finishUnitOneLessons();
    expect(getActiveItem(pathItems, progress)?.id).toBe('u1-quiz');
    expect(getItemStatus(pathItems, 6, progress)).toBe('locked');
  });

  test('a failed quiz keeps the next unit locked; a pass opens it', () => {
    const failed = recordQuizAttempt(
      finishUnitOneLessons(),
      { id: 'u1-quiz', passPercent: 60 },
      [true, true, false, false, false],
      day,
    ).progress;
    expect(getActiveItem(pathItems, failed)?.id).toBe('u1-quiz');

    const passed = recordQuizAttempt(
      failed,
      { id: 'u1-quiz', passPercent: 60 },
      [true, true, true, false, false],
      day,
    ).progress;
    expect(getActiveItem(pathItems, passed)?.id).toBe('u2-l1');
  });

  test('explains what to unlock first for each locked item', () => {
    expect(getLockReason(pathItems, 1)).toEqual({
      kind: 'previous-lesson',
      lesson: course.units[0]!.lessons[0]!,
    });
    expect(getLockReason(pathItems, 5)).toEqual({ kind: 'quiz-needs-lessons' });
    expect(getLockReason(pathItems, 6)).toEqual({ kind: 'previous-quiz', unitNumber: 1 });
  });
});

describe('summaries', () => {
  test('course progress counts lessons only', () => {
    expect(getCourseProgress(finishUnitOneLessons())).toEqual({ done: 5, total: 10, percent: 50 });
  });

  test('profile stats: level per 100 XP and average of best quiz scores', () => {
    const progress = recordQuizAttempt(
      finishUnitOneLessons(),
      { id: 'u1-quiz', passPercent: 60 },
      [true, true, true, true, false],
      day,
    ).progress;
    expect(progress.xp).toBe(70);
    expect(getProfileStats(progress)).toEqual({
      level: 1,
      xpIntoLevel: 70,
      quizzesPassed: 1,
      averageScore: 80,
    });
    expect(getProfileStats(createProgress(day)).averageScore).toBeNull();
  });

  test('weekly activity covers the 7 days ending today', () => {
    const week = getWeeklyActivity(finishUnitOneLessons(), day);
    expect(week).toHaveLength(7);
    expect(week[6]).toEqual({ day, xp: 50, weekday: 2, isToday: true }); // 3 Nov 2026 is a Tuesday
    expect(week[0]?.day).toBe('2026-10-28');
  });
});
