import { useEvent, useEventListener } from 'expo';
import type { VideoPlayer, VideoPlayerStatus } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { useT } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, radius, space } from '@/theme/tokens';

import { clampTime, formatSpeed, qualityHeights, setPlayer, SKIP_SECONDS } from './player-controls';
import { VideoScrubber } from './video-scrubber';
import { VideoSettingsSheet } from './video-settings-sheet';

type VideoControlsProps = {
  player: VideoPlayer;
  status: VideoPlayerStatus;
  /** Inline or in the fullscreen modal; flips the fullscreen button's icon. */
  fullscreen: boolean;
  onToggleFullscreen: () => void;
};

type Side = 'back' | 'forward';

/** Controls fade out after this long while the video plays untouched. */
const HIDE_AFTER_MS = 3000;
/** Two taps on the same half within this window count as a double tap. */
const DOUBLE_TAP_MS = 280;
/** After a double tap, every further tap on that half within this window skips again. */
const STREAK_MS = 700;

/**
 * Custom player chrome over the video: tap to show or hide, double tap a half
 * to skip 5s (keep tapping to skip more), drag the bar to seek, and a sheet for
 * speed and quality. The same controls run inline and in fullscreen.
 */
export function VideoControls({
  player,
  status,
  fullscreen,
  onToggleFullscreen,
}: VideoControlsProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();

  const { currentTime, bufferedPosition } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    bufferedPosition: player.bufferedPosition,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const { playbackRate } = useEvent(player, 'playbackRateChange', {
    playbackRate: player.playbackRate,
  });
  const { videoTrack } = useEvent(player, 'videoTrackChange', { videoTrack: player.videoTrack });
  const duration = player.duration;

  // Whether the learner wants it playing. Unlike `player.playing`, this stays true
  // while the stream buffers, so a stall shows a spinner rather than a play button.
  const [wantsPlay, setWantsPlay] = useState(() => player.playing);
  const [ended, setEnded] = useState(false);
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (isPlaying) {
      setWantsPlay(true);
      setEnded(false);
    } else if (player.status !== 'loading') setWantsPlay(false);
  });
  useEventListener(player, 'playToEnd', () => {
    setWantsPlay(false);
    setEnded(true);
  });

  const [visible, setVisible] = useState(true);
  const [touches, setTouches] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Inline and fullscreen each mount their own controls, so start from the player's state.
  const [quality, setQuality] = useState(() => player.maxResolution?.height ?? null);

  /** Shows the controls and restarts the hide timer. */
  const poke = () => {
    setVisible(true);
    setTouches((count) => count + 1);
  };

  useEffect(() => {
    if (!visible || !wantsPlay || scrubTime !== null || settingsOpen) return;
    const timer = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [visible, wantsPlay, scrubTime, settingsOpen, touches]);

  // Skip feedback ("−10 сек") on the side that was tapped; repeated skips add up.
  const [skipped, setSkipped] = useState<{ side: Side; seconds: number } | null>(null);
  const skipTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const skip = (side: Side) => {
    const delta = side === 'back' ? -SKIP_SECONDS : SKIP_SECONDS;
    setPlayer(player, { currentTime: clampTime(player.currentTime + delta, duration) });
    setEnded(false);
    setSkipped((last) => ({
      side,
      seconds: last?.side === side ? last.seconds + SKIP_SECONDS : SKIP_SECONDS,
    }));
    clearTimeout(skipTimer.current);
    skipTimer.current = setTimeout(() => setSkipped(null), STREAK_MS);
    haptics.tap();
  };

  // Single tap toggles the controls, but waits briefly in case it's a double tap.
  const width = useRef(1);
  const lastTap = useRef<{ at: number; side: Side } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onSurfaceTap = (x: number) => {
    const side: Side = x < width.current / 2 ? 'back' : 'forward';
    const now = Date.now();
    const last = lastTap.current;
    lastTap.current = { at: now, side };
    const doubleTap = last?.side === side && now - last.at < DOUBLE_TAP_MS;
    const streak = skipped?.side === side;
    if (doubleTap || streak) {
      clearTimeout(tapTimer.current);
      skip(side);
      return;
    }
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      if (visible) setVisible(false);
      else poke();
    }, DOUBLE_TAP_MS);
  };
  useEffect(
    () => () => {
      clearTimeout(tapTimer.current);
      clearTimeout(skipTimer.current);
    },
    [],
  );

  const togglePlay = () => {
    poke();
    if (wantsPlay) {
      player.pause();
      setWantsPlay(false);
      return;
    }
    if (ended) setPlayer(player, { currentTime: 0 });
    setEnded(false);
    setWantsPlay(true);
    player.play();
  };

  const buffering = status === 'loading' && wantsPlay;
  const shownTime = scrubTime ?? currentTime;
  const playIcon: IconName = ended ? 'replay' : wantsPlay ? 'pause' : 'play';
  const playLabel = ended ? t.player.replay : wantsPlay ? t.player.pause : t.player.play;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width;
      }}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={(event) => onSurfaceTap(event.nativeEvent.locationX)}
        accessible={false}
      />

      {skipped ? (
        <Animated.View
          key={skipped.side}
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(250)}
          pointerEvents="none"
          style={[
            styles.ripple,
            skipped.side === 'back' ? styles.rippleBack : styles.rippleForward,
          ]}
        >
          <Icon
            name={skipped.side === 'back' ? 'skipBack' : 'skipForward'}
            color={colors.white}
            size={28}
          />
          <AppText variant="label" weight="bold" color={colors.white} tabular>
            {`${skipped.side === 'back' ? '−' : '+'}${t.player.seeked(skipped.seconds)}`}
          </AppText>
        </Animated.View>
      ) : null}

      {buffering && !visible ? (
        <View pointerEvents="none" style={styles.center}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      ) : null}

      {visible ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(250)}
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <View pointerEvents="none" style={styles.scrim} />

          <View pointerEvents="box-none" style={styles.top}>
            <ControlButton
              icon={muted ? 'volumeOff' : 'volume'}
              label={muted ? t.player.unmute : t.player.mute}
              onPress={() => {
                poke();
                setPlayer(player, { muted: !muted });
              }}
            />
            <View style={styles.row}>
              <Pressable
                onPress={() => setSettingsOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t.player.settings}
                hitSlop={4}
                style={({ pressed }) => [styles.button, styles.settings, pressed && styles.pressed]}
              >
                {playbackRate !== 1 ? (
                  <AppText variant="caption" color={colors.white} tabular>
                    {formatSpeed(playbackRate)}
                  </AppText>
                ) : null}
                <Icon name="sliders" color={colors.white} size={22} />
              </Pressable>
            </View>
          </View>

          <View pointerEvents="box-none" style={styles.center}>
            <View pointerEvents="box-none" style={styles.transport}>
              <SkipButton
                side="back"
                label={t.player.back(SKIP_SECONDS)}
                onPress={() => {
                  poke();
                  skip('back');
                }}
              />
              {buffering ? (
                <View style={styles.play}>
                  <ActivityIndicator color={colors.white} size="large" />
                </View>
              ) : (
                <Pressable
                  onPress={togglePlay}
                  accessibilityRole="button"
                  accessibilityLabel={playLabel}
                  style={({ pressed }) => [styles.play, pressed && styles.pressed]}
                >
                  <Icon name={playIcon} color={colors.white} size={36} />
                </Pressable>
              )}
              <SkipButton
                side="forward"
                label={t.player.forward(SKIP_SECONDS)}
                onPress={() => {
                  poke();
                  skip('forward');
                }}
              />
            </View>
          </View>

          <View pointerEvents="box-none" style={styles.bottom}>
            <View pointerEvents="box-none" style={styles.timeRow}>
              <AppText variant="caption" color={colors.white} tabular>
                {formatDuration(shownTime)}
                <AppText variant="caption" color={colors.videoBuffered} tabular>
                  {` / ${formatDuration(duration)}`}
                </AppText>
              </AppText>
              <ControlButton
                icon={fullscreen ? 'fullscreenExit' : 'fullscreen'}
                label={fullscreen ? t.player.exitFullscreen : t.player.fullscreen}
                onPress={onToggleFullscreen}
              />
            </View>
            <VideoScrubber
              time={shownTime}
              buffered={bufferedPosition}
              duration={duration}
              scrubbing={scrubTime !== null}
              onScrub={setScrubTime}
              onSeek={(time) => {
                setPlayer(player, { currentTime: time });
                setScrubTime(null);
                setEnded(false);
                poke();
              }}
            />
          </View>
        </Animated.View>
      ) : null}

      <VideoSettingsSheet
        visible={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          poke();
        }}
        speed={playbackRate}
        onSpeed={(speed) => {
          setPlayer(player, { playbackRate: speed });
          // On iOS a new rate also starts playback; a paused video stays paused.
          if (!wantsPlay) player.pause();
        }}
        qualities={qualityHeights(player.availableVideoTracks)}
        quality={quality}
        playingHeight={videoTrack?.size.height || null}
        onQuality={(height) => {
          setQuality(height);
          // A cap: the player picks the best rendition at or under it, or adapts freely.
          setPlayer(player, {
            maxResolution: height ? { width: Math.ceil((height * 16) / 9), height } : null,
          });
        }}
      />
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon name={icon} color={colors.white} size={22} />
    </Pressable>
  );
}

function SkipButton({ side, label, onPress }: { side: Side; label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
    >
      <Icon name={side === 'back' ? 'skipBack' : 'skipForward'} color={colors.white} size={34} />
      <AppText variant="caption" weight="bold" color={colors.white} style={styles.skipNumber}>
        {SKIP_SECONDS}
      </AppText>
    </Pressable>
  );
}

const PLAY = 64;

const useStyles = makeStyles((colors) => ({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.videoScrim,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: space[1],
  },
  row: {
    flexDirection: 'row',
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  play: {
    width: PLAY,
    height: PLAY,
    borderRadius: PLAY,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.videoScrim,
  },
  skip: {
    width: controlHeight.button,
    height: controlHeight.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipNumber: {
    position: 'absolute',
    // Optically centered inside the ring, which is open at the top.
    top: 18,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space[4],
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -space[2],
    marginRight: -space[3],
  },
  button: {
    minWidth: controlHeight.control,
    height: controlHeight.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  settings: {
    flexDirection: 'row',
    gap: space[1],
    paddingHorizontal: space[2],
  },
  pressed: {
    opacity: 0.6,
  },
  ripple: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1],
    backgroundColor: colors.videoTrack,
  },
  rippleBack: {
    left: 0,
    borderTopRightRadius: radius.full,
    borderBottomRightRadius: radius.full,
  },
  rippleForward: {
    right: 0,
    borderTopLeftRadius: radius.full,
    borderBottomLeftRadius: radius.full,
  },
}));
