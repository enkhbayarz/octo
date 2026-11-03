import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, type Palette, pressDepth, radius, space } from '@/theme/tokens';

import { AppText } from './app-text';

type Tone = 'primary' | 'secondary' | 'success' | 'danger';

function toneColors(colors: Palette, tone: Tone | 'disabled') {
  return {
    primary: { face: colors.primary, shadow: colors.primaryShadow, label: colors.white },
    secondary: { face: colors.card, shadow: colors.line, label: colors.ink },
    success: { face: colors.success, shadow: colors.successDark, label: colors.white },
    danger: { face: colors.danger, shadow: colors.dangerDark, label: colors.white },
    disabled: { face: colors.lock, shadow: colors.lockDark, label: colors.muted },
  }[tone];
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: Tone;
  /**
   * Looks disabled but still reports presses through `onPress`, so the screen
   * can explain *why* (shake + message) instead of silently ignoring the tap.
   */
  disabled?: boolean;
  /** 0–1 fill behind the label, used to show progress toward enabling. */
  fill?: number;
  icon?: ReactNode;
  accessibilityHint?: string;
};

/** Full-width 3D button: a 4pt "shadow" slab the face presses down into. */
export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  fill,
  icon,
  accessibilityHint,
}: ButtonProps) {
  const styles = useStyles();
  const palette = toneColors(useColors(), disabled ? 'disabled' : tone);
  const bordered = tone === 'secondary' && !disabled;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={styles.root}
    >
      {({ pressed }) => {
        const down = pressed && !disabled;
        return (
          <>
            <View style={[styles.slab, { backgroundColor: palette.shadow }]} />
            <View
              style={[
                styles.face,
                {
                  backgroundColor: palette.face,
                  transform: [{ translateY: down ? pressDepth : 0 }],
                },
                bordered && styles.bordered,
              ]}
            >
              {fill !== undefined && disabled ? (
                <View style={[styles.fill, { width: `${Math.min(1, fill) * 100}%` }]} />
              ) : null}
              {icon}
              <AppText weight="bold" color={palette.label}>
                {label}
              </AppText>
            </View>
          </>
        );
      }}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  root: {
    height: controlHeight.button + pressDepth,
    alignSelf: 'stretch',
  },
  slab: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: pressDepth,
    height: controlHeight.button,
    borderRadius: radius.md,
  },
  face: {
    height: controlHeight.button,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    overflow: 'hidden',
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primaryMid,
    opacity: 0.6,
  },
}));
