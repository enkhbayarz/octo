import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, radius, space } from '@/theme/tokens';

import { AppText } from './app-text';

type StatPillProps = {
  icon: ReactNode;
  value: ReactNode;
  accessibilityLabel: string;
  tone?: 'plain' | 'fire';
  onPress: () => void;
  /** Its panel is open. */
  expanded?: boolean;
};

/** Rounded counter in the home header (streak, XP). Tapping it opens its panel. */
export function StatPill({
  icon,
  value,
  accessibilityLabel,
  tone = 'plain',
  onPress,
  expanded = false,
}: StatPillProps) {
  const styles = useStyles();
  const colors = useColors();
  const fire = tone === 'fire';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded }}
      style={({ pressed }) => [
        styles.pill,
        fire && styles.fire,
        (pressed || expanded) && styles.active,
      ]}
    >
      {icon}
      <AppText weight="bold" tabular color={fire ? colors.fireText : colors.ink}>
        {value}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  pill: {
    height: controlHeight.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingLeft: space[2],
    paddingRight: space[3],
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fire: {
    backgroundColor: colors.fireLight,
    borderColor: colors.fireBorder,
  },
  active: {
    borderColor: colors.inkSoft,
    transform: [{ scale: 0.96 }],
  },
}));
