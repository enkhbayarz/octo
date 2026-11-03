import { VideoView, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, gutter, radius, space } from '@/theme/tokens';

type LessonVideoProps = {
  player: VideoPlayer;
  status: VideoPlayerStatus;
  isOffline: boolean;
  onRetry: () => void;
};

/**
 * Native player controls (play/pause, seek, fullscreen) are familiar, accessible
 * and handled by the OS; we only add the loading and error states around them.
 */
export function LessonVideo({ player, status, isOffline, onRetry }: LessonVideoProps) {
  const styles = useStyles();
  const t = useT();
  const colors = useColors();
  return (
    <View style={styles.frame}>
      <View style={styles.clip}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls
          contentFit="contain"
          fullscreenOptions={{ enable: true }}
          allowsPictureInPicture={false}
        />

        {status === 'loading' ? (
          <Animated.View exiting={FadeOut} style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={colors.sun} size="large" />
            <AppText variant="label" color={colors.white} style={styles.dim}>
              {t.lesson.loading}
            </AppText>
          </Animated.View>
        ) : null}

        {status === 'error' ? (
          <Animated.View entering={FadeIn} style={styles.overlay} accessibilityRole="alert">
            <Icon name="wifiOff" color={colors.sun} size={32} />
            <AppText weight="bold" color={colors.white} align="center">
              {isOffline ? t.lesson.offlineTitle : t.lesson.errorTitle}
            </AppText>
            <AppText
              variant="label"
              color={colors.white}
              align="center"
              style={[styles.dim, styles.body]}
            >
              {t.lesson.errorBody}
            </AppText>
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            >
              <LottieIcon name="refresh" color={colors.primary} size={20} delay={0} />
              <AppText variant="label" weight="semibold" color={colors.primary}>
                {t.common.retry}
              </AppText>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  frame: {
    marginHorizontal: gutter,
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    backgroundColor: colors.video,
    boxShadow: `0 16px 32px -16px ${colors.shadow}`,
  },
  // Clipping lives on an inner view: on iOS, clipping the frame would also hide its shadow.
  clip: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
    padding: space[6],
    backgroundColor: colors.video,
  },
  dim: {
    opacity: 0.8,
  },
  body: {
    maxWidth: 260,
  },
  retry: {
    height: controlHeight.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  retryPressed: {
    opacity: 0.8,
  },
}));
