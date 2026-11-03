import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useEffectEvent } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { haptics } from '@/lib/haptics';

/** Must match `backgroundColor` of expo-splash-screen in app.json (same in both themes). */
const BRAND = '#F2701F';
const WHITE = '#FFFFFF';

/** Must match `imageWidth` in app.json, so the native splash hands over without a jump. */
const OCTO_SIZE = 220;

/**
 * The 3D Окто with only the eyes/mouth changed per frame (every other pixel is
 * identical), so swapping frames reads as the character blinking and glancing.
 */
const FRAMES = [
  require('@/assets/images/splash/octo-open.webp'),
  require('@/assets/images/splash/octo-half.webp'),
  require('@/assets/images/splash/octo-closed.webp'),
  require('@/assets/images/splash/octo-left.webp'),
  require('@/assets/images/splash/octo-right.webp'),
  require('@/assets/images/splash/octo-happy.webp'),
] as const;
const [OPEN, HALF, CLOSED, LEFT, RIGHT, HAPPY] = [0, 1, 2, 3, 4, 5];

/** [ms from start, frame]: blink, glance left and right, blink, happy grin. */
const FACE_TRACK: [number, number][] = [
  [420, HALF],
  [460, CLOSED],
  [530, HALF],
  [570, OPEN],
  [760, LEFT],
  [1000, RIGHT],
  [1240, OPEN],
  [1400, HALF],
  [1440, CLOSED],
  [1500, HAPPY],
];
const HAPPY_AT = 1500;
const SHRINK_AT = 1880;
const REVEAL_AT = 2000;
const REVEAL_MS = 460;

const AnimatedPath = Animated.createAnimatedComponent(Path);

type AnimatedSplashProps = {
  /** Called once the app is fully revealed and the splash can be unmounted. */
  onDone: () => void;
};

/**
 * Окто on the brand color comes alive (blink, glance, happy bounce), then shrinks
 * away and a circle opens from the center onto the already-rendered app.
 * It never blocks touches.
 */
export function AnimatedSplash({ onDone }: AnimatedSplashProps) {
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const finish = useEffectEvent(onDone);

  const frame = useSharedValue(OPEN);
  const scale = useSharedValue(1);
  const squash = useSharedValue(0); // > 0 wider and shorter, < 0 taller
  const bob = useSharedValue(0);
  const hole = useSharedValue(0); // reveal circle radius
  const word = useSharedValue(1);

  const maxRadius = Math.hypot(width, height) / 2 + 20;

  useEffect(() => {
    SplashScreen.hideAsync();

    if (reduceMotion) {
      word.set(withTiming(0, { duration: 250 }));
      hole.set(withDelay(250, withTiming(maxRadius, { duration: 300 })));
      const done = setTimeout(finish, 600);
      return () => clearTimeout(done);
    }

    // Instant frame swaps, like a flipbook.
    let previous = 0;
    frame.set(
      withSequence(
        ...FACE_TRACK.map(([at, value]) => {
          const step = withDelay(at - previous, withTiming(value, { duration: 0 }));
          previous = at;
          return step;
        }),
      ),
    );
    scale.set(
      withSequence(
        withTiming(1.05, { duration: 160, easing: Easing.out(Easing.quad) }),
        withSpring(1, { dampingRatio: 0.5, duration: 450 }),
        withDelay(
          SHRINK_AT - 610,
          withTiming(0, { duration: 220, easing: Easing.in(Easing.back(2)) }),
        ),
      ),
    );
    squash.set(
      withDelay(
        HAPPY_AT,
        withSequence(
          withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
          withTiming(-0.7, { duration: 110 }),
          withSpring(0, { dampingRatio: 0.4, duration: 400 }),
        ),
      ),
    );
    bob.set(
      withRepeat(withTiming(-5, { duration: 650, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    word.set(withDelay(REVEAL_AT + 120, withTiming(0, { duration: 160 })));
    hole.set(
      withDelay(
        REVEAL_AT,
        withTiming(maxRadius, { duration: REVEAL_MS, easing: Easing.inOut(Easing.cubic) }),
      ),
    );

    const tap = setTimeout(haptics.tap, HAPPY_AT);
    const done = setTimeout(finish, REVEAL_AT + REVEAL_MS);
    return () => {
      clearTimeout(tap);
      clearTimeout(done);
    };
  }, [reduceMotion, maxRadius, frame, scale, squash, bob, hole, word]);

  // The brand color is one path with a circular hole, so the app shows through it.
  const cx = width / 2;
  const cy = height / 2;
  const backgroundProps = useAnimatedProps(() => {
    const r = hole.get();
    const circle =
      r > 0 ? `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z` : '';
    return { d: `M0 0H${width}V${height}H0Z${circle}` };
  });
  const octoStyle = useAnimatedStyle(() => {
    const s = squash.get() * 0.08;
    return {
      transform: [
        { translateY: bob.get() },
        { scaleX: scale.get() * (1 + s) },
        { scaleY: scale.get() * (1 - s) },
      ],
    };
  });
  const wordStyle = useAnimatedStyle(() => ({ opacity: word.get() }));

  return (
    <View
      style={styles.fill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <StatusBar style="light" />
      <Svg width={width} height={height} style={styles.fill}>
        <AnimatedPath animatedProps={backgroundProps} fill={BRAND} fillRule="evenodd" />
      </Svg>
      <View style={[styles.fill, styles.center]}>
        <Animated.View style={[styles.octo, octoStyle]}>
          {FRAMES.map((source, index) => (
            <Frame key={index} source={source} index={index} frame={frame} />
          ))}
        </Animated.View>
      </View>
      <Animated.View style={[styles.wordmark, wordStyle]}>
        <AppText variant="display" color={WHITE} style={styles.wordmarkText}>
          octolearn
        </AppText>
      </Animated.View>
    </View>
  );
}

type FrameProps = {
  source: number;
  index: number;
  frame: SharedValue<number>;
};

/** All frames stay mounted (decoded up front); only the current one is visible. */
function Frame({ source, index, frame }: FrameProps) {
  const style = useAnimatedStyle(() => ({ opacity: frame.get() === index ? 1 : 0 }));
  return <Animated.Image source={source} style={[styles.frame, style]} />;
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  octo: {
    width: OCTO_SIZE,
    height: OCTO_SIZE,
    // Squash from the tentacle tips, like landing on the ground.
    transformOrigin: '50% 90%',
  },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: OCTO_SIZE,
    height: OCTO_SIZE,
  },
  wordmark: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 72,
    alignItems: 'center',
  },
  wordmarkText: {
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
});
