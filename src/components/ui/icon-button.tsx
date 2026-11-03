import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { makeStyles } from '@/theme/theme';
import { controlHeight, radius } from '@/theme/tokens';

type IconButtonProps = {
  label: string;
  onPress: () => void;
  children: ReactNode;
};

/** A 44×44 tap target around an icon. `label` is read by screen readers. */
export function IconButton({ label, onPress, children }: IconButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  button: {
    width: controlHeight.control,
    height: controlHeight.control,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.soft,
  },
}));
