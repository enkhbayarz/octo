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

const progress = () => useProgress.getState();
const ALL_RIGHT = [true, true, true, true, true];

beforeEach(() => progress().reset());

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
