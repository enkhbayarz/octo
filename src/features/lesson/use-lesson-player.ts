import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';

import type { Lesson } from '@/course';
import { useIsOffline } from '@/hooks/use-is-offline';
import { useProgress } from '@/progress/store';

import { watchedRatio } from './watch-progress';

/** How often (in seconds of playback) the resume point is written to storage. */
const SAVE_EVERY = 2;

/**
 * End-to-end runs (`bun run start:e2e`) start each lesson 3s before its end, so
 * a flow doesn't sit through 15 minutes of video. The finish rules still run.
 */
const E2E = process.env.EXPO_PUBLIC_E2E === '1';

/**
 * Owns the video player for one lesson and reports how much has been watched.
 * Playback state lives in the native player; React only mirrors what the UI needs.
 * The resume point and furthest position are saved, so leaving a lesson halfway
 * neither restarts the video nor resets progress toward the 90% rule.
 */
export function useLessonPlayer({ id: lessonId, videoUrl: url, durationSec }: Lesson) {
  const saveVideoProgress = useProgress((state) => state.saveVideoProgress);
  // Read once: the saved spot is only where playback starts.
  const [saved] = useState(() => useProgress.getState().videoProgress[lessonId]);

  const player = useVideoPlayer(url, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
    instance.play();
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [furthest, setFurthest] = useState(saved?.furthest ?? 0);
  const [reachedEnd, setReachedEnd] = useState(false);
  const lastSaved = useRef(saved?.position ?? 0);
  const resumed = useRef(false);

  useEventListener(player, 'statusChange', ({ status: next }) => {
    if (next !== 'readyToPlay' || resumed.current) return;
    resumed.current = true;
    const position = E2E ? player.duration - 3 : (saved?.position ?? 0);
    // Skip resuming for a tiny head start or a spot right at the end.
    if (position > 1 && position < player.duration - 1)
      player.seekBy(position - player.currentTime);
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const nextFurthest = Math.max(furthest, currentTime);
    setFurthest(nextFurthest);
    if (Math.abs(currentTime - lastSaved.current) >= SAVE_EVERY) {
      lastSaved.current = currentTime;
      saveVideoProgress(lessonId, currentTime, nextFurthest);
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (!isPlaying) saveVideoProgress(lessonId, player.currentTime, furthest);
  });

  useEventListener(player, 'playToEnd', () => setReachedEnd(true));

  const retry = () => {
    player.replaceAsync(url).then(
      () => player.play(),
      () => {},
    );
  };

  // Recover by itself when the connection comes back.
  const isOffline = useIsOffline();
  useEffect(() => {
    if (!isOffline && status === 'error') retry();
    // retry() is recreated each render; only connectivity changes should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline]);

  return {
    player,
    status,
    isOffline,
    // Before metadata loads, fall back to the course's listed duration.
    ratio: watchedRatio(furthest, player.duration || durationSec),
    reachedEnd,
    retry,
  };
}
