import { describe, expect, test } from 'bun:test';

import {
  completeLesson,
  createProgress,
  currentStreak,
  isPassingScore,
  normalizeName,
  recordQuizAttempt,
  saveVideoProgress,
  XP_PER_LESSON,
  XP_PER_QUIZ_PASS,
} from './rules';

const quiz = { id: 'u1-quiz', passPercent: 60 };

describe('completeLesson', () => {
  test('marks the lesson, grants XP and logs today’s activity', () => {
    const { progress, outcome } = completeLesson(
      createProgress('2026-11-03'),
      'u1-l1',
      '2026-11-03',
    );
    expect(progress.completedLessons['u1-l1']).toBe(true);
    expect(progress.xp).toBe(XP_PER_LESSON);
    expect(progress.activity['2026-11-03']).toBe(XP_PER_LESSON);
    expect(outcome).toEqual({ xpGained: XP_PER_LESSON, streakIncreased: true });
  });

  test('a re-watched lesson earns nothing and changes nothing', () => {
    const first = completeLesson(createProgress('2026-11-03'), 'u1-l1', '2026-11-03').progress;
    const again = completeLesson(first, 'u1-l1', '2026-11-04');
    expect(again.progress).toBe(first);
    expect(again.outcome.xpGained).toBe(0);
  });
});

describe('streak', () => {
  test('grows on consecutive days and only once per day', () => {
    let progress = createProgress('2026-11-01');
    progress = completeLesson(progress, 'a', '2026-11-01').progress;
    progress = completeLesson(progress, 'b', '2026-11-01').progress;
    expect(progress.streak.count).toBe(1);
    progress = completeLesson(progress, 'c', '2026-11-02').progress;
    expect(progress.streak.count).toBe(2);
  });

  test('restarts at 1 after a missed day', () => {
    let progress = completeLesson(createProgress('2026-11-01'), 'a', '2026-11-01').progress;
    progress = completeLesson(progress, 'b', '2026-11-03').progress;
    expect(progress.streak.count).toBe(1);
  });

  test('shows 0 once the last active day is older than yesterday', () => {
    const progress = completeLesson(createProgress('2026-11-01'), 'a', '2026-11-01').progress;
    expect(currentStreak(progress, '2026-11-02')).toBe(1);
    expect(currentStreak(progress, '2026-11-03')).toBe(0);
  });
});

describe('quiz attempts', () => {
  test('60% is the pass mark', () => {
    expect(isPassingScore(3, 5, 60)).toBe(true);
    expect(isPassingScore(2, 5, 60)).toBe(false);
    expect(isPassingScore(0, 0, 60)).toBe(false);
  });

  test('first pass grants XP; a later pass does not', () => {
    const passing = [true, true, true, false, false];
    const first = recordQuizAttempt(createProgress('2026-11-03'), quiz, passing, '2026-11-03');
    expect(first.outcome).toEqual({
      correct: 3,
      total: 5,
      passed: true,
      xpGained: XP_PER_QUIZ_PASS,
    });

    const second = recordQuizAttempt(first.progress, quiz, passing, '2026-11-03');
    expect(second.outcome.xpGained).toBe(0);
    expect(second.progress.xp).toBe(XP_PER_QUIZ_PASS);
  });

  test('keeps the best score and stays passed after a worse retry', () => {
    const passed = recordQuizAttempt(
      createProgress('2026-11-03'),
      quiz,
      [true, true, true, true, false],
      '2026-11-03',
    );
    const worse = recordQuizAttempt(
      passed.progress,
      quiz,
      [false, false, false, false, false],
      '2026-11-03',
    );
    expect(worse.outcome.passed).toBe(false);
    expect(worse.progress.quizResults[quiz.id]).toEqual({
      best: 4,
      total: 5,
      passed: true,
      attempts: 2,
    });
  });

  test('a failed attempt still counts toward the streak', () => {
    const { progress } = recordQuizAttempt(
      createProgress('2026-11-03'),
      quiz,
      [false, false, false],
      '2026-11-03',
    );
    expect(progress.streak).toEqual({ count: 1, lastActiveDay: '2026-11-03' });
    expect(progress.xp).toBe(0);
  });
});

describe('learner name', () => {
  test('trims and collapses whitespace', () => {
    expect(normalizeName('  Энхбаяр   Б  ')).toBe('Энхбаяр Б');
  });

  test('rejects empty and overly long names', () => {
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('а'.repeat(25))).toBeNull();
  });
});

describe('video progress', () => {
  const day = '2026-11-03';

  test('keeps the furthest point even after rewinding', () => {
    let progress = saveVideoProgress(createProgress(day), 'u1-l1', 8, 8);
    progress = saveVideoProgress(progress, 'u1-l1', 2, 2);
    expect(progress.videoProgress['u1-l1']).toEqual({ position: 2, furthest: 8 });
  });

  test('is cleared when the lesson is completed and not saved after', () => {
    const saved = saveVideoProgress(createProgress(day), 'u1-l1', 9, 9);
    const done = completeLesson(saved, 'u1-l1', day).progress;
    expect(done.videoProgress['u1-l1']).toBeUndefined();
    expect(saveVideoProgress(done, 'u1-l1', 3, 3)).toBe(done);
  });
});
