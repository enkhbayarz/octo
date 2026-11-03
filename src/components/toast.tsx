import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { makeStyles, useColors } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

import { LottieIcon, type LottieIconName } from './lottie-icon';
import { AppText } from './ui/app-text';

type ToastState = {
  toast: { id: number; message: string; icon: LottieIconName } | null;
};

const useToastStore = create<ToastState>(() => ({ toast: null }));

const VISIBLE_MS = 2400;

/** Shows a short message at the top of the screen. Callable from anywhere, no hook needed. */
export function showToast(message: string, icon: LottieIconName = 'lock-3') {
  useToastStore.setState({ toast: { id: Date.now(), message, icon } });
  AccessibilityInfo.announceForAccessibility(message);
}

/** Mounted once in the root layout, above every screen. */
export function ToastHost() {
  const styles = useStyles();
  const colors = useColors();
  const toast = useToastStore((state) => state.toast);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useToastStore.setState({ toast: null }), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <View style={[styles.host, { top: insets.top + space[2] }]} pointerEvents="none">
      <Animated.View
        key={toast.id}
        entering={FadeInUp.springify().dampingRatio(1)}
        exiting={FadeOutUp.duration(200)}
        style={styles.toast}
        accessibilityRole="alert"
      >
        <View style={styles.icon}>
          <LottieIcon name={toast.icon} color={colors.white} size={20} delay={120} />
        </View>
        <AppText variant="label" weight="semibold" color={colors.white} style={styles.message}>
          {toast.message}
        </AppText>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  host: {
    position: 'absolute',
    left: space[4],
    right: space[4],
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.toast,
    boxShadow: `0 12px 32px -12px ${colors.shadow}`,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
  },
}));
