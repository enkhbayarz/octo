import { type AudioPlayer, createAudioPlayer } from 'expo-audio';

import { useSettings } from '@/settings/store';

/** Short original tones, synthesized for this app (see README). */
const SOURCES = {
  correct: require('@/assets/sounds/correct.mp3'),
  wrong: require('@/assets/sounds/wrong.mp3'),
  complete: require('@/assets/sounds/complete.mp3'),
};

export type SoundName = keyof typeof SOURCES;

const players: Partial<Record<SoundName, AudioPlayer>> = {};

/**
 * Plays a feedback sound unless the learner turned sounds off. iOS also respects
 * the silent switch (expo-audio's default). Like haptics, failures are ignored.
 */
export function playSound(name: SoundName) {
  if (!useSettings.getState().sound) return;
  try {
    const player = (players[name] ??= createAudioPlayer(SOURCES[name]));
    player.seekTo(0);
    player.play();
  } catch {
    // Feedback only; never block the flow.
  }
}
