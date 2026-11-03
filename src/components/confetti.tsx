import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { palettes } from '@/theme/tokens';

const { primary, sun, fire, success } = palettes.light;
/** Brand fills plus two accents; bright enough for both themes. */
const PALETTE = [primary, sun, fire, success, '#4CC9F0', '#F15BB5'];
const PIECES = 40;

type Piece = {
  left: number;
  width: number;
  height: number;
  round: boolean;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
};

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, index) => ({
    left: Math.random(),
    width: 6 + Math.random() * 6,
    height: 8 + Math.random() * 9,
    round: Math.random() > 0.6,
    color: PALETTE[index % PALETTE.length] ?? primary,
    delay: Math.random() * 700,
    duration: 2300 + Math.random() * 1600,
    drift: Math.random() * 90 - 45,
    spin: Math.random() * 720 - 360,
  }));
}

function ConfettiPiece({ piece, width, height }: { piece: Piece; width: number; height: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: piece.duration, easing: Easing.in(Easing.quad) }),
    );
  }, [piece, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.85 ? 1 : (1 - progress.value) / 0.15,
    transform: [
      { translateX: piece.drift * progress.value },
      { translateY: progress.value * (height + 40) },
      { rotate: `${piece.spin * progress.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: piece.left * width,
          width: piece.width,
          height: piece.height,
          borderRadius: piece.round ? piece.width / 2 : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

/** One celebratory burst. Skipped entirely when the OS asks for reduced motion. */
export function Confetti() {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [pieces] = useState(makePieces);

  if (reduceMotion) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece, index) => (
        <ConfettiPiece key={index} piece={piece} width={width} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: -24,
  },
});
