import { useEffect } from 'react';
import { Image } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export type MascotMood = 'happy' | 'joy' | 'sad';

/** 3D renders of the same character, one per mood (432 px, enough for 136 pt at @3x). */
const IMAGES = {
  happy: require('@/assets/images/mascot/octo-happy.webp'),
  joy: require('@/assets/images/mascot/octo-joy.webp'),
  sad: require('@/assets/images/mascot/octo-sad.webp'),
} satisfies Record<MascotMood, number>;

type MascotProps = {
  mood?: MascotMood;
  size?: number;
  /** Gentle idle bob. Disabled automatically when the OS asks for reduced motion. */
  floating?: boolean;
};

/** "Окто", OctoLearn's own octopus mascot (original artwork, not Duolingo's). */
export function Mascot({ mood = 'happy', size = 96, floating = false }: MascotProps) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (!floating || reduceMotion) return;
    offset.value = withRepeat(
      withTiming(-6, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [floating, reduceMotion, offset]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View style={floatStyle} accessible={false}>
      <Image source={IMAGES[mood]} style={{ width: size, height: size }} />
    </Animated.View>
  );
}
