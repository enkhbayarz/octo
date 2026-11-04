import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as React from 'react';

// AsyncStorage is native; an in-memory map stands in for it.
const disk = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => void disk.set(key, value),
    removeItem: async (key: string) => void disk.delete(key),
  },
}));
// Outside a component, the hydration hook is read directly.
mock.module('react', () => ({
  ...React,
  useSyncExternalStore: (
    subscribe: (onChange: () => void) => () => void,
    getSnapshot: () => unknown,
  ) => {
    subscribe(() => {})();
    return getSnapshot();
  },
}));

const { useProgress, useProgressHydrated: readHydrated } = await import('./store');
const { createProgress } = await import('./rules');
const { today } = await import('@/lib/dates');
const { course } = await import('@/course');
const { useSync } = await import('@/sync/store');

const progress = () => useProgress.getState();
const outbox = () => useSync.getState();
/** The right option for every question of unit 1's quiz. */
const ALL_RIGHT = course.units[0]!.quiz.questions.map((question) => question.answerIndex);

beforeEach(() => {
  progress().reset();
  outbox().unlink();
});

describe('progress store', () => {
  test('hydrates from storage', () => {
    expect(readHydrated()).toBe(true);
  });

  test('saves a trimmed name and ignores an empty one', () => {
    progress().setLearnerName('  Тэмүүлэн  ');
    expect(progress().learnerName).toBe('Тэмүүлэн');
    progress().setLearnerName('   ');
    expect(progress().learnerName).toBe('Тэмүүлэн');
  });

  test('keeps the onboarding answers', () => {
    progress().setAnswers({ reason: 'travel', level: 'new', dailyMinutes: 10 });
    expect(progress().answers).toEqual({ reason: 'travel', level: 'new', dailyMinutes: 10 });
  });

  test('completing a lesson earns XP once and clears its video position', () => {
    progress().saveVideoProgress('u1-l1', 4, 6);
    expect(progress().videoProgress['u1-l1']).toEqual({ position: 4, furthest: 6 });

    expect(progress().completeLesson('u1-l1').xpGained).toBe(10);
    expect(progress().completeLesson('u1-l1').xpGained).toBe(0);
    expect(progress().xp).toBe(10);
    expect(progress().videoProgress['u1-l1']).toBeUndefined();
  });

  test('records quiz attempts and refuses unknown quizzes', () => {
    expect(progress().submitQuiz('u1-quiz', ALL_RIGHT).passed).toBe(true);
    expect(progress().quizResults['u1-quiz']?.passed).toBe(true);
    expect(() => progress().submitQuiz('u1-l1', ALL_RIGHT)).toThrow('Unknown quiz');
  });

  test('grades the chosen options itself', () => {
    const wrong = ALL_RIGHT.map((answer) => (answer + 1) % 3);
    expect(progress().submitQuiz('u1-quiz', wrong)).toMatchObject({ correct: 0, passed: false });
  });

  test('a guest queues nothing for the server', () => {
    progress().setLearnerName('Болд');
    progress().completeLesson('u1-l1');
    expect(outbox().queue).toEqual([]);
  });

  test('a signed-in learner queues every change for the server', () => {
    outbox().link('user_1');
    progress().setLearnerName('Болд');
    progress().setAnswers({ reason: 'work', level: 'some', dailyMinutes: 15 });
    progress().saveVideoProgress('u1-l1', 2, 3);
    progress().saveVideoProgress('u1-l1', 1, 5);
    progress().completeLesson('u1-l1');
    progress().completeLesson('u1-l1'); // already done: nothing new to send
    progress().submitQuiz('u1-quiz', ALL_RIGHT);

    const [profile, video, lesson, quiz, ...rest] = outbox().queue;
    expect(profile).toEqual({
      kind: 'profile',
      displayName: 'Болд',
      onboarding: { reason: 'work', level: 'some', dailyMinutes: 15 },
    });
    expect(video).toEqual({ kind: 'video', lessonId: 'u1-l1', positionSec: 1, furthestSec: 5 });
    expect(lesson).toEqual({ kind: 'lesson', lessonId: 'u1-l1' });
    expect(quiz).toMatchObject({
      kind: 'quiz',
      quizId: 'u1-quiz',
      answers: ALL_RIGHT,
      key: expect.any(String),
    });
    expect(rest).toEqual([]);
  });

  test("merges the account's progress", () => {
    progress().applyServer(
      {
        xp: 70,
        streak: { count: 2, lastActiveDay: today() },
        completedLessons: ['u1-l1'],
        quizResults: {},
        videoProgress: {},
        activity: [{ day: today(), xp: 10 }],
      },
      {
        id: 'u',
        displayName: 'Сараа',
        email: null,
        timezone: 'Asia/Ulaanbaatar',
        onboarding: null,
        xp: 70,
        streak: 2,
      },
    );
    expect(progress()).toMatchObject({
      learnerName: 'Сараа',
      xp: 70,
      completedLessons: { 'u1-l1': true },
    });
  });

  test('reset starts over', () => {
    progress().setLearnerName('Тэмүүлэн');
    progress().reset();
    expect(progress().learnerName).toBe('');
  });

  test('persists data only, never actions', async () => {
    progress().setLearnerName('Болд');
    await Promise.resolve();
    const saved = JSON.parse(disk.get('octolearn.progress') ?? '{}');
    expect(saved.state.learnerName).toBe('Болд');
    expect(saved.state.reset).toBeUndefined();
  });

  test('migrates older saves by filling in missing fields', async () => {
    const migrate = useProgress.persist.getOptions().migrate;
    const migrated = await migrate?.({ learnerName: 'Сараа', xp: 30 }, 1);
    expect(migrated).toMatchObject({ ...createProgress(today()), learnerName: 'Сараа', xp: 30 });
  });
});
