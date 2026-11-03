/** Derived values. Nothing here is stored, so it can never drift out of sync. */
import { type Lesson, lessonCount, type PathItem, pathItems } from '@/course';
import { addDays, type DayKey, fromDayKey } from '@/lib/dates';
import { toPercent } from '@/lib/format';

import type { ItemStatus, Progress } from './types';

export const XP_PER_LEVEL = 100;

export function isItemDone(item: PathItem, progress: Progress): boolean {
  return item.kind === 'lesson'
    ? Boolean(progress.completedLessons[item.id])
    : Boolean(progress.quizResults[item.id]?.passed);
}

/** Route guard: deep links to unknown or locked items are sent home. */
export function isUnlocked(id: string, progress: Progress): boolean {
  const index = pathItems.findIndex((item) => item.id === id);
  return index >= 0 && getItemStatus(pathItems, index, progress) !== 'locked';
}

/** An item opens once the item before it is done. The first item is always open. */
export function getItemStatus(items: PathItem[], index: number, progress: Progress): ItemStatus {
  const item = items[index];
  if (!item) return 'locked';
  if (isItemDone(item, progress)) return 'done';
  const previous = items[index - 1];
  return !previous || isItemDone(previous, progress) ? 'active' : 'locked';
}

export function getActiveItem(items: PathItem[], progress: Progress): PathItem | undefined {
  return items.find((_, index) => getItemStatus(items, index, progress) === 'active');
}

export function getCourseProgress(progress: Progress) {
  const done = Object.keys(progress.completedLessons).length;
  return { done, total: lessonCount, percent: toPercent(done, lessonCount) };
}

/** Why a locked item can't be opened; the UI words it as what to do next. */
export type LockReason =
  | { kind: 'quiz-needs-lessons' }
  | { kind: 'previous-quiz'; unitNumber: number }
  | { kind: 'previous-lesson'; lesson: Lesson }
  | { kind: 'locked' };

export function getLockReason(items: PathItem[], index: number): LockReason {
  const item = items[index];
  const previous = items[index - 1];
  if (item?.kind === 'quiz') return { kind: 'quiz-needs-lessons' };
  if (previous?.kind === 'quiz')
    return { kind: 'previous-quiz', unitNumber: previous.unitIndex + 1 };
  if (previous?.kind === 'lesson') return { kind: 'previous-lesson', lesson: previous.lesson };
  return { kind: 'locked' };
}

export function getProfileStats(progress: Progress) {
  const results = Object.values(progress.quizResults);
  const averageScore = results.length
    ? Math.round(
        (results.reduce((sum, result) => sum + result.best / result.total, 0) / results.length) *
          100,
      )
    : null;

  return {
    level: Math.floor(progress.xp / XP_PER_LEVEL) + 1,
    xpIntoLevel: progress.xp % XP_PER_LEVEL,
    quizzesPassed: results.filter((result) => result.passed).length,
    averageScore,
  };
}

/** The last 7 days ending today, oldest first. `weekday` is 0 (Sunday) to 6. */
export function getWeeklyActivity(progress: Progress, day: DayKey) {
  return Array.from({ length: 7 }, (_, index) => {
    const key = addDays(day, index - 6);
    return {
      day: key,
      xp: progress.activity[key] ?? 0,
      weekday: fromDayKey(key).getDay(),
      isToday: key === day,
    };
  });
}
