import { StyleSheet, Text, type TextProps } from 'react-native';

import { useColors } from '@/theme/theme';
import { type FontWeight, fonts, type TextVariant, typeScale } from '@/theme/tokens';

export type AppTextProps = TextProps & {
  variant?: TextVariant;
  weight?: FontWeight;
  /** Defaults to the theme's ink color. */
  color?: string;
  align?: 'left' | 'center' | 'right';
  /** Fixed-width digits so counters don't jitter while they change. */
  tabular?: boolean;
};

/** The only text component. Size, line height and font always come from the type scale. */
export function AppText({
  variant = 'body',
  weight,
  color,
  align,
  tabular,
  style,
  ...props
}: AppTextProps) {
  const colors = useColors();
  const scale = typeScale[variant];
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: fonts[weight ?? scale.weight],
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          color: color ?? colors.ink,
          textAlign: align,
        },
        tabular && styles.tabular,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
