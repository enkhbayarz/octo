import { describe, expect, test } from 'vitest';

import { addDays, dayKeyInZone, isoWeek, isValidTimeZone } from './dates.js';

describe('dayKeyInZone', () => {
  test("is the learner's local calendar day, not UTC's", () => {
    const instant = new Date('2026-11-03T20:00:00Z');
    expect(dayKeyInZone(instant, 'UTC')).toBe('2026-11-03');
    expect(dayKeyInZone(instant, 'Asia/Ulaanbaatar')).toBe('2026-11-04');
    expect(dayKeyInZone(instant, 'America/Los_Angeles')).toBe('2026-11-03');
  });
});

describe('addDays', () => {
  test('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('isValidTimeZone', () => {
  test('accepts IANA names only', () => {
    expect(isValidTimeZone('Asia/Ulaanbaatar')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('isoWeek', () => {
  test('runs Monday 00:00 UTC to the next Monday', () => {
    const week = isoWeek(new Date('2026-11-04T12:00:00Z'));
    expect(week.key).toBe('2026-W45');
    expect(week.start.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(week.end.toISOString()).toBe('2026-11-09T00:00:00.000Z');
  });

  test('Sunday belongs to the week that started the Monday before', () => {
    expect(isoWeek(new Date('2026-11-08T23:59:59Z')).key).toBe('2026-W45');
  });

  test('uses the ISO year at year boundaries', () => {
    expect(isoWeek(new Date('2021-01-03T00:00:00Z')).key).toBe('2020-W53');
    expect(isoWeek(new Date('2024-12-30T00:00:00Z')).key).toBe('2025-W01');
  });
});
