import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { makeStyles, useColors } from '@/theme/theme';
import { type Palette, radius, space } from '@/theme/tokens';

type Tone = 'fire' | 'sun' | 'primary' | 'success' | 'sky';

function toneColors(colors: Palette, tone: Tone) {
  return {
    fire: { background: colors.fireLight, foreground: colors.fire },
    sun: { background: colors.sunLight, foreground: colors.sunDark },
    primary: { background: colors.primaryLight, foreground: colors.primary },
    success: { background: colors.successLight, foreground: colors.success },
    sky: { background: colors.skyLight, foreground: colors.sky },
  }[tone];
}

type StatTileProps = {
  tone: Tone;
  icon: (color: string) => ReactNode;
  value: string | number;
  label: string;
};

export function StatTile({ tone, icon, value, label }: StatTileProps) {
  const styles = useStyles();
  const colors = useColors();
  const { background, foreground } = toneColors(colors, tone);
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.icon, { backgroundColor: background }]}>{icon(foreground)}</View>
      <View>
        <AppText variant="title" tabular>
          {value}
        </AppText>
        <AppText variant="label" color={colors.muted}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
