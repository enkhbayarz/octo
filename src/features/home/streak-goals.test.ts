import { describe, expect, test } from 'bun:test';

import { hoursLeftToday, streakMilestone } from './streak-goals';

describe('streakMilestone', () => {
  test('a new learner works toward 3 days', () => {
    expect(streakMilestone(0)).toEqual({ from: 0, to: 3 });
    expect(streakMilestone(2)).toEqual({ from: 0, to: 3 });
  });

  test('reaching a milestone moves to the next one', () => {
    expect(streakMilestone(3)).toEqual({ from: 3, to: 7 });
    expect(streakMilestone(20)).toEqual({ from: 14, to: 30 });
    expect(streakMilestone(364)).toEqual({ from: 200, to: 365 });
  });

  test('after a year, every year is a milestone', () => {
    expect(streakMilestone(365)).toEqual({ from: 365, to: 730 });
    expect(streakMilestone(800)).toEqual({ from: 730, to: 1095 });
  });
});

describe('hoursLeftToday', () => {
  test('rounds up to whole hours', () => {
    expect(hoursLeftToday(new Date(2026, 10, 4, 23, 30))).toBe(1);
    expect(hoursLeftToday(new Date(2026, 10, 4, 9, 0))).toBe(15);
  });
});
