import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useShake } from '@/hooks/use-shake';
import { useT } from '@/i18n';
import type { ItemStatus } from '@/progress/types';
import { makeStyles, useColors } from '@/theme/theme';
import { radius, space, type Palette } from '@/theme/tokens';

import { NODE_DEPTH, type PathNodeLayout } from './path-layout';

const WRAPPER_WIDTH = 200;

type PathNodeProps = {
  layout: PathNodeLayout;
  kind: 'lesson' | 'quiz';
  status: ItemStatus;
  title: string;
  /** Best quiz score, e.g. "4/5". */
  badge?: string;
  /** Pop in: this node was just unlocked. */
  celebrate?: boolean;
  onPress: () => void;
};

function nodeColors(colors: Palette, kind: PathNodeProps['kind'], status: ItemStatus) {
  if (status === 'locked')
    return { face: colors.lock, shadow: colors.lockDark, icon: colors.lockIcon };
  if (kind === 'quiz') return { face: colors.sun, shadow: colors.sunDark, icon: colors.white };
  return { face: colors.primary, shadow: colors.primaryShadow, icon: colors.white };
}

/** Pulsing ring that marks "you are here". */
function Halo({ color, size }: { color: string; size: number }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(
      withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }),
      -1,
    );
  }, [reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - progress.value),
    transform: [{ scale: 0.9 + progress.value * 0.35 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.halo, { width: size + 16, height: size + 16, borderColor: color }, style]}
    />
  );
}

function StartBubble({ kind }: { kind: PathNodeProps['kind'] }) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    offset.value = withRepeat(
      withTiming(-4, { duration: 800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion, offset]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View style={[styles.bubble, style]} pointerEvents="none">
      <AppText
        variant="caption"
        weight="bold"
        color={kind === 'quiz' ? colors.sunText : colors.primaryText}
        style={styles.bubbleText}
      >
        {kind === 'quiz' ? t.home.quizBubble : t.home.startBubble}
      </AppText>
      <View style={styles.bubbleTip} />
    </Animated.View>
  );
}

export function PathNode({
  layout,
  kind,
  status,
  title,
  badge,
  celebrate,
  onPress,
}: PathNodeProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const { face, shadow, icon } = nodeColors(colors, kind, status);
  const { size } = layout;
  const { shake, style: shakeStyle } = useShake();
  const [lockKey, setLockKey] = useState(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!celebrate) return;
    scale.value = withSequence(
      withTiming(0.55, { duration: 0 }),
      withDelay(250, withSpring(1, { dampingRatio: 0.5, duration: 700 })),
    );
  }, [celebrate, scale]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (status === 'locked') {
      shake();
      setLockKey((key) => key + 1);
    }
    onPress();
  };

  const iconSize = kind === 'quiz' ? 40 : 32;
  const glyph =
    kind === 'quiz' ? (
      <LottieIcon
        name="star"
        color={icon}
        size={iconSize}
        delay={status === 'active' ? 600 : undefined}
      />
    ) : status === 'done' ? (
      <Icon name="check" color={icon} size={28} />
    ) : status === 'active' ? (
      <LottieIcon name="play" color={icon} size={iconSize} delay={600} />
    ) : (
      <LottieIcon name="lock-2" color={icon} size={iconSize} playKey={lockKey} />
    );

  return (
    <Animated.View
      style={[styles.wrapper, { left: layout.x - WRAPPER_WIDTH / 2, top: layout.top }, shakeStyle]}
    >
      {status === 'active' ? <StartBubble kind={kind} /> : null}
      <Animated.View style={popStyle}>
        {status === 'active' ? <Halo color={face} size={size} /> : null}
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${t.home.status[status]}`}
          style={{ width: size, height: size + NODE_DEPTH }}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  styles.circle,
                  styles.slab,
                  { width: size, height: size, backgroundColor: shadow },
                ]}
              />
              <View
                style={[
                  styles.circle,
                  {
                    width: size,
                    height: size,
                    backgroundColor: face,
                    transform: [{ translateY: pressed ? NODE_DEPTH : 0 }],
                  },
                ]}
              >
                <View style={[styles.shine, status === 'locked' && styles.shineLocked]} />
                {glyph}
                {badge ? (
                  <View style={styles.badge}>
                    <AppText variant="caption" weight="bold" color={colors.sunText} tabular>
                      {badge}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </>
          )}
        </Pressable>
      </Animated.View>
      <AppText
        variant="label"
        weight={status === 'active' ? 'bold' : 'semibold'}
        color={
          status === 'active'
            ? colors.primaryText
            : status === 'locked'
              ? colors.muted
              : colors.inkSoft
        }
        numberOfLines={1}
        align="center"
        style={styles.caption}
      >
        {title}
      </AppText>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrapper: {
    position: 'absolute',
    width: WRAPPER_WIDTH,
    alignItems: 'center',
  },
  circle: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slab: {
    position: 'absolute',
    top: NODE_DEPTH,
  },
  shine: {
    position: 'absolute',
    top: 8,
    left: 14,
    width: 16,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    transform: [{ rotate: '-28deg' }],
  },
  shineLocked: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  halo: {
    position: 'absolute',
    top: -8,
    left: -8,
    borderWidth: 4,
    borderRadius: radius.full,
  },
  badge: {
    position: 'absolute',
    right: -8,
    bottom: -4,
    height: 24,
    paddingHorizontal: space[2],
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.sunDark,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  // Paper backdrop so the dotted connector passes behind the text, not through it.
  caption: {
    marginTop: space[3],
    maxWidth: WRAPPER_WIDTH,
    paddingHorizontal: space[2],
    borderRadius: radius.xs,
    backgroundColor: colors.paper,
  },
  bubble: {
    position: 'absolute',
    top: -44,
    zIndex: 1,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    boxShadow: `0 2px 0 ${colors.line}`,
  },
  bubbleText: {
    letterSpacing: 0.7,
  },
  bubbleTip: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 10,
    height: 10,
    backgroundColor: colors.card,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    transform: [{ rotate: '45deg' }],
  },
}));
