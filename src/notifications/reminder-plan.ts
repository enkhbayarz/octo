/**
 * Which study reminders to schedule. Pure: "now" and progress are passed in.
 *
 * Reminders are scheduled one by one for the next few days instead of as a
 * repeating daily trigger, so today's can be skipped once the learner has
 * already studied, and the first one can mention the streak at risk.
 */
import type { Messages } from '@/i18n/mn';
import { addDays, type DayKey, fromDayKey, toDayKey } from '@/lib/dates';

/** Days ahead to schedule. Re-planned on every launch and after every activity. */
export const REMINDER_DAYS = 7;

export const REMINDER_HOURS = [9, 13, 19, 21] as const;

export type PlannedReminder = {
  date: Date;
  title: string;
  body: string;
};

type PlanInput = {
  now: Date;
  hour: number;
  learnerName: string;
  /** Streak as shown today (already lapsed streaks count as 0). */
  streak: number;
  lastActiveDay: DayKey | null;
  /** Wording in the learner's language. */
  copy: Messages['notifications'];
};

export function planReminders({
  now,
  hour,
  learnerName,
  streak,
  lastActiveDay,
  copy,
}: PlanInput): PlannedReminder[] {
  const today = toDayKey(now);
  const studiedToday = lastActiveDay === today;

  const reminders: PlannedReminder[] = [];
  for (let offset = 0; offset < REMINDER_DAYS; offset += 1) {
    const date = fromDayKey(addDays(today, offset));
    date.setHours(hour, 0, 0, 0);
    // Nothing in the past, and no nagging on a day that already counts.
    if (date <= now || (offset === 0 && studiedToday)) continue;

    // The first reminder protects a live streak: today if not yet studied,
    // otherwise tomorrow, when the streak would lapse.
    const protectsStreak = streak > 0 && reminders.length === 0;
    reminders.push({
      date,
      ...(protectsStreak
        ? { title: copy.streakTitle(streak), body: copy.streakBody(learnerName) }
        : (copy.generic[offset % copy.generic.length] ?? copy.generic[0]!)),
    });
  }
  return reminders;
}
