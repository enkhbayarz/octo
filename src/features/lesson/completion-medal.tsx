import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { makeStyles, useColors } from '@/theme/theme';
import { radius } from '@/theme/tokens';

const SIZE = 208;
const RAYS = 12;

/** Sun rays: thin wedges around the center, drawn once and rotated. */
const RAY_PATH = Array.from({ length: RAYS }, (_, index) => {
  const angle = (index / RAYS) * Math.PI * 2;
  const spread = Math.PI / RAYS / 3;
  const r = SIZE / 2;
  const point = (a: number) => `${r + Math.cos(a) * r} ${r + Math.sin(a) * r}`;
  return `M${r} ${r}L${point(angle - spread)}L${point(angle + spread)}Z`;
}).join('');

/** Big check medal that springs in over slowly turning rays. */
export function CompletionMedal() {
  const styles = useStyles();
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  const pop = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    pop.value = withDelay(100, withSpring(1, { dampingRatio: 0.55, duration: 700 }));
    if (!reduceMotion) {
      turn.value = withRepeat(withTiming(360, { duration: 16000, easing: Easing.linear }), -1);
    }
  }, [reduceMotion, pop, turn]);

  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const faceStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.3 + pop.value * 0.7 }, { rotate: `${(1 - pop.value) * -30}deg` }],
  }));

  return (
    <View style={styles.root} accessible={false}>
      <Animated.View style={[styles.rays, raysStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Path d={RAY_PATH} fill={colors.sun} opacity={0.3} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.face, faceStyle]}>
        <Icon name="check" color={colors.white} size={56} />
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  rays: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
  },
  face: {
    width: 112,
    height: 112,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 6px 0 ${colors.primaryShadow}`,
  },
}));
