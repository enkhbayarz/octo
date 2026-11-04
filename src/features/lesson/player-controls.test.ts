import { describe, expect, test } from 'bun:test';

import { clampTime, formatSpeed, qualityHeights } from './player-controls';

describe('player controls', () => {
  test('skips stay inside the video', () => {
    expect(clampTime(-3, 600)).toBe(0);
    expect(clampTime(602, 600)).toBe(600);
    expect(clampTime(42, 600)).toBe(42);
    expect(clampTime(5, 0)).toBe(0);
  });

  test('quality options are distinct heights, best first', () => {
    const track = (height: number) => ({ size: { height } });
    expect(qualityHeights([track(360), track(720), track(540), track(720), track(0)])).toEqual([
      720, 540, 360,
    ]);
    expect(qualityHeights([])).toEqual([]);
  });

  test('speed labels drop trailing zeros', () => {
    expect(formatSpeed(1)).toBe('1×');
    expect(formatSpeed(1.25)).toBe('1.25×');
    expect(formatSpeed(0.5)).toBe('0.5×');
  });
});
