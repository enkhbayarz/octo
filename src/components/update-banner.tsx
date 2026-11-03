import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, radius, space } from '@/theme/tokens';

import { LottieIcon } from './lottie-icon';
import { AppText } from './ui/app-text';

/** Off in development and Expo Go, where updates come from Metro instead. */
const updatesActive = !__DEV__ && Updates.isEnabled;

/**
 * Over-the-air updates (EAS Update). The app checks once per launch and downloads
 * in the background; when a new version is ready, this offers to restart into it
 * now instead of waiting for the next cold start. Never blocks the learner.
 */
export function UpdateBanner() {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (!updatesActive) return;
    Updates.checkForUpdateAsync()
      .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : undefined))
      .catch(() => {
        // Offline or server error: keep running the current version.
      });
  }, []);

  if (!updatesActive || !isUpdatePending) return null;
  return (
    <Animated.View
      entering={FadeInDown.springify().dampingRatio(1)}
      exiting={FadeOutDown}
      style={[styles.banner, { bottom: insets.bottom + 96 }]}
      accessibilityRole="alert"
    >
      <LottieIcon name="refresh" color={colors.sun} size={24} delay={300} />
      <View style={styles.text}>
        <AppText variant="label" weight="bold" color={colors.white}>
          {t.update.ready}
        </AppText>
        <AppText variant="caption" weight="medium" color={colors.white} style={styles.dim}>
          {t.update.body}
        </AppText>
      </View>
      <Pressable
        onPress={() => Updates.reloadAsync()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      >
        <AppText variant="label" weight="bold" color={colors.primary}>
          {t.update.action}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/** "Version 1.0.0 · OTA 3f9a1c2e": which build and which update is running. Shown on Profile. */
export function appVersionLabel(versionLabel: string): string {
  const update =
    updatesActive && !Updates.isEmbeddedLaunch && Updates.updateId
      ? Updates.updateId.slice(0, 8)
      : null;
  return [versionLabel, update && `OTA ${update}`, Updates.channel].filter(Boolean).join(' · ');
}

const useStyles = makeStyles((colors) => ({
  banner: {
    position: 'absolute',
    left: space[4],
    right: space[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    paddingLeft: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.toast,
    boxShadow: `0 12px 32px -12px ${colors.shadow}`,
  },
  text: {
    flex: 1,
  },
  dim: {
    opacity: 0.8,
  },
  action: {
    height: controlHeight.control,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  actionPressed: {
    opacity: 0.85,
  },
}));
