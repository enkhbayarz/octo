/** A local calendar day, `YYYY-MM-DD`. Streaks and activity are counted per day key. */
export type DayKey = string;

export function toDayKey(date: Date): DayKey {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromDayKey(key: DayKey): Date {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

export function today(): DayKey {
  return toDayKey(new Date());
}
