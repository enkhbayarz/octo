import { describe, expect, test } from 'bun:test';

import { en } from '@/i18n/en';
import { mn } from '@/i18n/mn';

import { planReminders, REMINDER_DAYS } from './reminder-plan';

const base = {
  hour: 19,
  learnerName: 'Тэмүүлэн',
  streak: 0,
  lastActiveDay: null,
  copy: mn.notifications,
};
const morning = new Date(2026, 10, 3, 9, 0); // 3 Nov, 09:00
const night = new Date(2026, 10, 3, 22, 0); // 3 Nov, 22:00

describe('planReminders', () => {
  test('schedules one reminder a day at the chosen hour, starting today', () => {
    const plan = planReminders({ ...base, now: morning });
    expect(plan).toHaveLength(REMINDER_DAYS);
    expect(plan[0]!.date).toEqual(new Date(2026, 10, 3, 19, 0));
    expect(plan[1]!.date).toEqual(new Date(2026, 10, 4, 19, 0));
  });

  test('never schedules in the past', () => {
    const plan = planReminders({ ...base, now: night });
    expect(plan[0]!.date).toEqual(new Date(2026, 10, 4, 19, 0));
    expect(plan.every((reminder) => reminder.date > night)).toBe(true);
  });

  test('skips today once the learner has studied', () => {
    const plan = planReminders({ ...base, now: morning, lastActiveDay: '2026-11-03' });
    expect(plan[0]!.date).toEqual(new Date(2026, 10, 4, 19, 0));
    expect(plan).toHaveLength(REMINDER_DAYS - 1);
  });

  test('the first reminder protects a live streak and uses the name', () => {
    const [first, second] = planReminders({ ...base, now: morning, streak: 4 });
    expect(first!.title).toContain('4 өдрийн streak');
    expect(first!.body).toStartWith('Тэмүүлэн, ');
    expect(second!.title).not.toContain('streak');
  });

  test('uses the learner’s language', () => {
    const [first] = planReminders({ ...base, now: morning, streak: 2, copy: en.notifications });
    expect(first!.title).toBe('🔥 Keep your 2-day streak');
  });
});
