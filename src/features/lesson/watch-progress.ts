/** The Finish button unlocks at 90% of the video, or when playback reaches the end. */
export const REQUIRED_WATCH_RATIO = 0.9;

/** Furthest point reached, as a 0–1 ratio of the video's duration. */
export function watchedRatio(furthestSeconds: number, durationSeconds: number): number {
  if (!(durationSeconds > 0)) return 0;
  return Math.min(1, Math.max(0, furthestSeconds / durationSeconds));
}

export function canFinishLesson(ratio: number, reachedEnd: boolean): boolean {
  return reachedEnd || ratio >= REQUIRED_WATCH_RATIO;
}

/** 0–1 progress toward unlocking, used to fill the Finish button. */
export function unlockProgress(ratio: number, reachedEnd: boolean): number {
  return reachedEnd ? 1 : Math.min(1, ratio / REQUIRED_WATCH_RATIO);
}
