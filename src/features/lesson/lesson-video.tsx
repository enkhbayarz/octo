import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { VideoView, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, radius, space } from '@/theme/tokens';

import { VideoControls } from './video-controls';

type LessonVideoProps = {
  player: VideoPlayer;
  status: VideoPlayerStatus;
  isOffline: boolean;
  onRetry: () => void;
};

const lock = (orientation: ScreenOrientation.OrientationLock) =>
  ScreenOrientation.lockAsync(orientation).catch(() => {});

type PlayerSurfaceProps = {
  player: VideoPlayer;
  status: VideoPlayerStatus;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  showControls: boolean;
  onFirstFrame?: () => void;
};

/** The picture plus our controls. Inline and fullscreen each render one, sharing the player. */
function PlayerSurface({
  player,
  status,
  fullscreen,
  onToggleFullscreen,
  showControls,
  onFirstFrame,
}: PlayerSurfaceProps) {
  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture={false}
        onFirstFrameRender={onFirstFrame}
      />
      {showControls ? (
        <VideoControls
          player={player}
          status={status}
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      ) : null}
    </>
  );
}

/**
 * The lesson video, edge to edge, with our own controls (VideoControls).
 * Fullscreen is ours too: a landscape modal with the same player and controls.
 * The app turns to landscape while it's open and back to portrait after.
 */
export function LessonVideo({ player, status, isOffline, onRetry }: LessonVideoProps) {
  const styles = useStyles();
  const t = useT();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [fullscreen, setFullscreen] = useState(false);
  // Until the first frame, loading covers the frame; after that a stall only shows a spinner.
  const [hasFrame, setHasFrame] = useState(false);
  // The modal doesn't always get fresh landscape insets, so the side margin is the largest inset
  // either way round: in portrait the Dynamic Island's is `top`, in landscape it's `left`/`right`.
  const side = Math.max(insets.left, insets.right, insets.top, space[6]);

  const enterFullscreen = () => {
    setFullscreen(true);
    lock(ScreenOrientation.OrientationLock.LANDSCAPE);
  };
  const exitFullscreen = () => {
    setFullscreen(false);
    lock(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };

  return (
    <View style={styles.frame}>
      <View style={styles.clip}>
        {fullscreen ? null : (
          <PlayerSurface
            player={player}
            status={status}
            fullscreen={false}
            onToggleFullscreen={enterFullscreen}
            showControls={hasFrame && status !== 'error'}
            onFirstFrame={() => setHasFrame(true)}
          />
        )}

        {!hasFrame && status !== 'error' ? (
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

      <Modal
        visible={fullscreen}
        animationType="fade"
        supportedOrientations={['landscape-left', 'landscape-right']}
        onRequestClose={exitFullscreen}
      >
        <StatusBar hidden />
        {/* The picture and controls stay clear of the Dynamic Island and the home indicator. */}
        <View
          style={[
            styles.fullscreen,
            {
              paddingHorizontal: side,
              paddingTop: space[3],
              paddingBottom: Math.max(insets.bottom, space[5]),
            },
          ]}
        >
          <View style={styles.fullscreenSafe}>
            <PlayerSurface
              player={player}
              status={status}
              fullscreen
              onToggleFullscreen={exitFullscreen}
              showControls={status !== 'error'}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // Full width, like every video app: the picture is as large as the phone allows.
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.video,
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
  },
  fullscreen: {
    flex: 1,
    backgroundColor: colors.video,
  },
  fullscreenSafe: {
    flex: 1,
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
