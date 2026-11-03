import { describe, expect, test } from 'bun:test';

import { addDays, fromDayKey, toDayKey } from './dates';

describe('day keys', () => {
  test('formats local dates with zero padding', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('round-trips through fromDayKey', () => {
    expect(toDayKey(fromDayKey('2026-11-03'))).toBe('2026-11-03');
  });

  test('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});
