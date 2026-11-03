import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, radius, space } from '@/theme/tokens';

import { AppText } from './app-text';

type StatPillProps = {
  icon: ReactNode;
  value: ReactNode;
  accessibilityLabel: string;
  tone?: 'plain' | 'fire';
};

/** Rounded counter in the home header (streak, XP). */
export function StatPill({ icon, value, accessibilityLabel, tone = 'plain' }: StatPillProps) {
  const styles = useStyles();
  const colors = useColors();
  const fire = tone === 'fire';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.pill, fire && styles.fire]}
    >
      {icon}
      <AppText weight="bold" tabular color={fire ? colors.fireText : colors.ink}>
        {value}
      </AppText>
    </View>
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
}));
