import { describe, expect, test } from 'bun:test';

import { formatDuration, toPercent } from './format';

describe('formatDuration', () => {
  test('pads seconds and drops fractions', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9.8)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
  });

  test('clamps negative input', () => {
    expect(formatDuration(-3)).toBe('0:00');
  });
});

describe('toPercent', () => {
  test('rounds to whole percent and guards zero', () => {
    expect(toPercent(7, 10)).toBe(70);
    expect(toPercent(2, 3)).toBe(67);
    expect(toPercent(1, 0)).toBe(0);
  });
});
