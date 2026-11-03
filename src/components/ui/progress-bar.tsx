import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { makeStyles, useColors } from '@/theme/theme';
import { radius } from '@/theme/tokens';

type ProgressBarProps = {
  /** 0–100 */
  percent: number;
  /** Defaults to the primary color. */
  color?: string;
  height?: number;
};

/** Animates to new values, so progress gained on another screen visibly fills in. */
export function ProgressBar({ percent, color, height = 8 }: ProgressBarProps) {
  const styles = useStyles();
  const colors = useColors();
  const width = useSharedValue(percent);

  useEffect(() => {
    width.value = withTiming(percent, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [percent, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View
      style={[styles.track, { height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: color ?? colors.primary }, fillStyle]}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  track: {
    borderRadius: radius.full,
    backgroundColor: colors.soft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
  },
}));
