import { useRef } from 'react';
import { type GestureResponderEvent, View } from 'react-native';

import { useT } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

import { clampTime, SKIP_SECONDS } from './player-controls';

type VideoScrubberProps = {
  /** Where the thumb sits: the playback time, or the drag position while scrubbing. */
  time: number;
  buffered: number;
  duration: number;
  scrubbing: boolean;
  /** Called on touch down and while dragging, with the time under the finger. */
  onScrub: (time: number) => void;
  /** Called when the finger lifts (or by VoiceOver's swipe up/down). */
  onSeek: (time: number) => void;
};

const fraction = (part: number, whole: number) =>
  whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;

/**
 * The seek bar: touch or drag anywhere on it. The touch area is taller than the
 * track so it's easy to grab; the track thickens while dragging.
 */
export function VideoScrubber({
  time,
  buffered,
  duration,
  scrubbing,
  onScrub,
  onSeek,
}: VideoScrubberProps) {
  const styles = useStyles();
  const t = useT();
  const left = useRef(0);
  const width = useRef(1);

  const timeAt = (event: GestureResponderEvent) =>
    fraction(event.nativeEvent.pageX - left.current, width.current) * duration;

  const played = `${fraction(time, duration) * 100}%` as const;
  const loaded = `${fraction(Math.max(buffered, time), duration) * 100}%` as const;

  return (
    <View
      style={styles.hit}
      onLayout={(event) => {
        width.current = Math.max(1, event.nativeEvent.layout.width);
      }}
      onStartShouldSetResponder={() => duration > 0}
      onMoveShouldSetResponder={() => duration > 0}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        // The bar's left edge on screen; later moves are measured from it.
        left.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
        onScrub(timeAt(event));
      }}
      onResponderMove={(event) => onScrub(timeAt(event))}
      onResponderRelease={(event) => onSeek(timeAt(event))}
      onResponderTerminate={(event) => onSeek(timeAt(event))}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t.player.seekBar}
      accessibilityValue={{ text: `${formatDuration(time)} / ${formatDuration(duration)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        const step = nativeEvent.actionName === 'increment' ? SKIP_SECONDS : -SKIP_SECONDS;
        onSeek(clampTime(time + step, duration));
      }}
    >
      {/* Children ignore touches, so locationX above is always relative to the bar. */}
      <View pointerEvents="none" style={[styles.track, scrubbing && styles.trackActive]}>
        <View style={[styles.buffered, { width: loaded }]} />
        <View style={[styles.played, { width: played }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, scrubbing && styles.thumbActive, { left: played }]}
      />
    </View>
  );
}

const TRACK = 4;
const THUMB = 14;

const useStyles = makeStyles((colors) => ({
  hit: {
    height: space[8],
    justifyContent: 'center',
  },
  track: {
    height: TRACK,
    borderRadius: TRACK,
    overflow: 'hidden',
    backgroundColor: colors.videoTrack,
  },
  trackActive: {
    height: TRACK * 1.5,
  },
  buffered: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.videoBuffered,
  },
  played: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  thumbActive: {
    transform: [{ scale: 1.35 }],
  },
}));
