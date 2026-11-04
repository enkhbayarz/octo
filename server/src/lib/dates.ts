/** A calendar day, `YYYY-MM-DD`. Streaks and daily activity are counted per learner-local day. */
export type DayKey = string;

const DAY_MS = 24 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // en-CA formats dates as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The learner's calendar day at `date`, in their own time zone. */
export function dayKeyInZone(date: Date, timeZone: string): DayKey {
  return dayFormatter(timeZone).format(date);
}

export function addDays(day: DayKey, days: number): DayKey {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    dayFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export type Week = { key: string; start: Date; end: Date };

/**
 * The ISO week (Monday 00:00 UTC to the next Monday) containing `date`. The
 * leaderboard is global, so its week boundary is UTC for everyone.
 */
export function isoWeek(date: Date): Week {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const weekday = (new Date(midnight).getUTCDay() + 6) % 7; // Monday = 0
  const start = midnight - weekday * DAY_MS;
  // The ISO year is the year of the week's Thursday.
  const isoYear = new Date(start + 3 * DAY_MS).getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const firstWeekStart = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const week = 1 + Math.round((start - firstWeekStart) / (7 * DAY_MS));
  return {
    key: `${isoYear}-W${String(week).padStart(2, '0')}`,
    start: new Date(start),
    end: new Date(start + 7 * DAY_MS),
  };
}
