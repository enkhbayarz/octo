/** Streak lengths worth celebrating; after a year, every further year. */
const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/** The milestone the learner is working toward, and the one they last passed (0 at first). */
export function streakMilestone(streak: number): { from: number; to: number } {
  const next = MILESTONES.find((milestone) => milestone > streak);
  if (next !== undefined) {
    const from = MILESTONES.filter((milestone) => milestone < next).at(-1) ?? 0;
    return { from, to: next };
  }
  const from = Math.floor(streak / 365) * 365;
  return { from, to: from + 365 };
}

/** Whole hours left before midnight, rounded up (23:30 → 1). */
export function hoursLeftToday(now: Date): number {
  return 24 - now.getHours();
}
