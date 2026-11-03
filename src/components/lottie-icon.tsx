import LottieView, { type AnimationObject } from 'lottie-react-native';
import { useEffect, useRef } from 'react';

import { tintLottie } from '@/lib/tint-lottie';

/** Iconly Pro animated icons. Each plays once (on mount after `delay`, or when `playKey` changes). */
const SOURCES = {
  calendar: require('@/assets/lottie/calendar.json'),
  'close-square': require('@/assets/lottie/close-square.json'),
  'fire-1': require('@/assets/lottie/fire-1.json'),
  'fire-3': require('@/assets/lottie/fire-3.json'),
  flash: require('@/assets/lottie/flash.json'),
  home: require('@/assets/lottie/home.json'),
  'lock-2': require('@/assets/lottie/lock-2.json'),
  'lock-3': require('@/assets/lottie/lock-3.json'),
  'medal-2': require('@/assets/lottie/medal-2.json'),
  'medal-3': require('@/assets/lottie/medal-3.json'),
  'medal-4': require('@/assets/lottie/medal-4.json'),
  play: require('@/assets/lottie/play.json'),
  'play-square': require('@/assets/lottie/play-square.json'),
  refresh: require('@/assets/lottie/refresh.json'),
  star: require('@/assets/lottie/star.json'),
  target: require('@/assets/lottie/target.json'),
  user: require('@/assets/lottie/user.json'),
  'video-badge': require('@/assets/lottie/video-badge.json'),
  'video-camera': require('@/assets/lottie/video-camera.json'),
} satisfies Record<string, AnimationObject>;

export type LottieIconName = keyof typeof SOURCES;

const tinted = new Map<string, AnimationObject>();

function tintedSource(name: LottieIconName, color: string): AnimationObject {
  const key = `${name}:${color}`;
  const cached = tinted.get(key);
  if (cached) return cached;
  const source = tintLottie<AnimationObject>(SOURCES[name], color);
  tinted.set(key, source);
  return source;
}

type LottieIconProps = {
  name: LottieIconName;
  color: string;
  size?: number;
  /** Play once this many ms after mount. Omit to show the resting frame. */
  delay?: number;
  /** Change this value to replay the animation (e.g. on tap). */
  playKey?: number;
};

export function LottieIcon({ name, color, size = 24, delay, playKey }: LottieIconProps) {
  const ref = useRef<LottieView>(null);

  useEffect(() => {
    if (delay === undefined) return;
    const timer = setTimeout(() => ref.current?.play(), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (playKey) ref.current?.play(0);
  }, [playKey]);

  return (
    <LottieView
      ref={ref}
      source={tintedSource(name, color)}
      autoPlay={false}
      loop={false}
      style={{ width: size, height: size }}
    />
  );
}
