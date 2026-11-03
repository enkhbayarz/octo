import { describe, expect, test } from 'bun:test';

import { canFinishLesson, unlockProgress, watchedRatio } from './watch-progress';

describe('watch progress', () => {
  test('ratio is clamped and safe before the duration is known', () => {
    expect(watchedRatio(5, 10)).toBe(0.5);
    expect(watchedRatio(12, 10)).toBe(1);
    expect(watchedRatio(3, 0)).toBe(0);
    expect(watchedRatio(3, Number.NaN)).toBe(0);
  });

  test('Finish unlocks at 90% or at the end of the video', () => {
    expect(canFinishLesson(0.89, false)).toBe(false);
    expect(canFinishLesson(0.9, false)).toBe(true);
    expect(canFinishLesson(0.2, true)).toBe(true);
  });

  test('button fill reaches 100% exactly at the 90% mark', () => {
    expect(unlockProgress(0.45, false)).toBe(0.5);
    expect(unlockProgress(0.95, false)).toBe(1);
    expect(unlockProgress(0, true)).toBe(1);
  });
});
