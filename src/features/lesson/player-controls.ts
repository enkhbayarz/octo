import type { VideoPlayer } from 'expo-video';

/** Seconds skipped by the ±5 buttons and by each double tap on either half of the video. */
export const SKIP_SECONDS = 5;

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** A seek target kept inside the video, so skipping near either end never overshoots. */
export function clampTime(seconds: number, duration: number): number {
  return Math.min(Math.max(0, seconds), Math.max(0, duration));
}

/** The stream's renditions as distinct heights, best first (e.g. [720, 540, 360]). */
export function qualityHeights(tracks: readonly { size: { height: number } }[]): number[] {
  const heights = new Set(tracks.map((track) => track.size.height).filter((height) => height > 0));
  return [...heights].sort((a, b) => b - a);
}

/** `1` → `1×`, `1.25` → `1.25×`. */
export function formatSpeed(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

type PlayerSettings = Partial<
  Pick<VideoPlayer, 'currentTime' | 'muted' | 'playbackRate' | 'maxResolution'>
>;

/**
 * expo-video is driven by assigning to the native player's properties. Doing it
 * here keeps components free of prop mutation (which the React Compiler rejects).
 */
export function setPlayer(player: VideoPlayer, settings: PlayerSettings): void {
  Object.assign(player, settings);
}
