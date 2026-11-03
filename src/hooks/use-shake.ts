import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** A short horizontal "no" shake for taps that can't proceed (locked lesson, nothing selected). */
export function useShake() {
  const offset = useSharedValue(0);

  const shake = () => {
    offset.value = withSequence(
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 80 }),
      withTiming(-4, { duration: 70 }),
      withTiming(4, { duration: 70 }),
      withTiming(0, { duration: 60 }),
    );
  };

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return { shake, style };
}
