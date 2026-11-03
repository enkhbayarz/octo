import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useShake } from '@/hooks/use-shake';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { type Palette, pressDepth, radius, space } from '@/theme/tokens';

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dimmed';

function looks(colors: Palette) {
  return {
    idle: {
      border: colors.line,
      face: colors.card,
      shadow: colors.line,
      text: colors.ink,
      key: colors.card,
      keyText: colors.muted,
      keyBorder: colors.line,
    },
    dimmed: {
      border: colors.line,
      face: colors.card,
      shadow: colors.line,
      text: colors.ink,
      key: colors.card,
      keyText: colors.muted,
      keyBorder: colors.line,
    },
    selected: {
      border: colors.primary,
      face: colors.primaryLight,
      shadow: colors.primaryMid,
      text: colors.primaryText,
      key: colors.primary,
      keyText: colors.white,
      keyBorder: colors.primary,
    },
    correct: {
      border: colors.success,
      face: colors.successLight,
      shadow: colors.successBorder,
      text: colors.successText,
      key: colors.success,
      keyText: colors.white,
      keyBorder: colors.success,
    },
    wrong: {
      border: colors.danger,
      face: colors.dangerLight,
      shadow: colors.dangerBorder,
      text: colors.dangerText,
      key: colors.danger,
      keyText: colors.white,
      keyBorder: colors.danger,
    },
  };
}

type AnswerOptionProps = {
  letter: string;
  text: string;
  state: OptionState;
  locked: boolean;
  onPress: () => void;
};

export function AnswerOption({ letter, text, state, locked, onPress }: AnswerOptionProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const stateLabel =
    state === 'correct' ? t.quiz.optionCorrect : state === 'wrong' ? t.quiz.optionWrong : null;
  const look = looks(colors)[state];
  const { shake, style: shakeStyle } = useShake();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (state === 'correct')
      scale.value = withSequence(withTiming(1.04, { duration: 150 }), withSpring(1));
    if (state === 'wrong') shake();
    // shake() is stable in behavior; react only to state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, scale]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[popStyle, shakeStyle, state === 'dimmed' && styles.dimmed]}>
      <Pressable
        onPress={onPress}
        disabled={locked}
        accessibilityRole="radio"
        accessibilityState={{ selected: state === 'selected', disabled: locked }}
        accessibilityLabel={[letter, text, stateLabel].filter(Boolean).join(', ')}
        style={styles.root}
      >
        {({ pressed }) => (
          <>
            <View style={[styles.slab, { backgroundColor: look.shadow }]} />
            <View
              style={[
                styles.face,
                {
                  borderColor: look.border,
                  backgroundColor: look.face,
                  transform: [{ translateY: pressed && !locked ? pressDepth : 0 }],
                },
              ]}
            >
              <View
                style={[styles.key, { backgroundColor: look.key, borderColor: look.keyBorder }]}
              >
                <AppText variant="label" weight="bold" color={look.keyText}>
                  {letter}
                </AppText>
              </View>
              <AppText weight="semibold" color={look.text} style={styles.text}>
                {text}
              </AppText>
              {state === 'correct' ? <Icon name="check" color={colors.success} /> : null}
              {state === 'wrong' ? <Icon name="close" color={colors.danger} /> : null}
            </View>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    minHeight: 64 + pressDepth,
  },
  slab: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: pressDepth,
    bottom: 0,
    borderRadius: radius.md,
  },
  face: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    marginBottom: pressDepth,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  key: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  dimmed: {
    opacity: 0.45,
  },
}));
