import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { haptics } from '@/lib/haptics';
import { makeStyles, useColors, useScheme } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

/**
 * Liquid Glass tab bars are drawn by iOS 26 itself, so it keeps the real native
 * tabs. Everything else gets this look-alike: a floating capsule with a rim
 * highlight and a sliding lens. Earlier iOS blurs what's behind it; Android has
 * no system blur, so its capsule is solid.
 */
const hasSystemBlur = Platform.OS === 'ios';

export const usesGlassTabBar = !hasSystemBlur || Number.parseInt(String(Platform.Version), 10) < 26;

const TAB_WIDTH = 96;
const BAR_HEIGHT = 62;
const BAR_PADDING = 4;

function barBottom(safeBottom: number) {
  return safeBottom > 0 ? safeBottom - space[2] : space[3];
}

/** Bottom padding for tab screens, so their last row scrolls clear of the floating bar. */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return usesGlassTabBar ? barBottom(insets.bottom) + BAR_HEIGHT + space[2] : 0;
}

export function GlassTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  const styles = useStyles();
  const colors = useColors();
  const scheme = useScheme();
  const width = state.routes.length * TAB_WIDTH + BAR_PADDING * 2;

  const lensX = useSharedValue(state.index * TAB_WIDTH);
  useEffect(() => {
    lensX.set(withSpring(state.index * TAB_WIDTH, { dampingRatio: 0.7, duration: 500 }));
  }, [state.index, lensX]);
  const lensStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lensX.get() }] }));

  return (
    <View style={[styles.host, { bottom: barBottom(insets.bottom) }]} pointerEvents="box-none">
      <View style={[styles.bar, { width }]} accessibilityRole="tablist">
        {hasSystemBlur ? (
          <BlurView
            tint={
              scheme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'
            }
            intensity={100}
            style={styles.fill}
          />
        ) : null}
        <View style={[styles.fill, hasSystemBlur ? styles.wash : styles.solid]} />
        {/* Light catching the top edge, fading out and back in along the bottom. */}
        <Svg width={width} height={BAR_HEIGHT} style={styles.fill} pointerEvents="none">
          <Defs>
            <LinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.glassRim} stopOpacity={1} />
              <Stop offset="0.45" stopColor={colors.glassRim} stopOpacity={0.1} />
              <Stop offset="1" stopColor={colors.glassRim} stopOpacity={0.55} />
            </LinearGradient>
            <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.glassRim} stopOpacity={0.35} />
              <Stop offset="0.5" stopColor={colors.glassRim} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={BAR_HEIGHT} rx={BAR_HEIGHT / 2} fill="url(#sheen)" />
          <Rect
            x={0.75}
            y={0.75}
            width={width - 1.5}
            height={BAR_HEIGHT - 1.5}
            rx={(BAR_HEIGHT - 1.5) / 2}
            fill="none"
            stroke="url(#rim)"
            strokeWidth={1.5}
          />
        </Svg>
        <Animated.View style={[styles.lens, lensStyle]} />

        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options;
          const focused = index === state.index;
          const color = focused ? colors.primaryText : colors.inkSoft;
          const label = options?.title ?? route.name;

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              haptics.tap();
              navigateToTab(route.key);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              {options?.tabBarIcon?.({ focused, color, size: 24 })}
              <AppText variant="caption" weight="semibold" color={color}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    padding: BAR_PADDING,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassEdge,
    boxShadow: `0 10px 30px -10px ${colors.shadow}`,
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  wash: {
    backgroundColor: colors.glass,
  },
  solid: {
    backgroundColor: colors.card,
  },
  lens: {
    position: 'absolute',
    top: BAR_PADDING,
    left: BAR_PADDING,
    width: TAB_WIDTH,
    height: BAR_HEIGHT - BAR_PADDING * 2,
    borderRadius: radius.full,
    backgroundColor: colors.glassLens,
  },
  tab: {
    width: TAB_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
}));
