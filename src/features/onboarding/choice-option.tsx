import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { makeStyles, useColors } from '@/theme/theme';
import { pressDepth, radius, space } from '@/theme/tokens';

type ChoiceOptionProps = {
  label: string;
  emoji?: string;
  /** Small text on the right, e.g. "Regular" next to a daily goal. */
  detail?: string;
  selected: boolean;
  onPress: () => void;
};

/** One answer to an onboarding question: a card that presses down like the 3D buttons. */
export function ChoiceOption({ label, emoji, detail, selected, onPress }: ChoiceOptionProps) {
  const styles = useStyles();
  const colors = useColors();
  const look = selected
    ? { border: colors.primary, face: colors.primaryLight, shadow: colors.primaryMid }
    : { border: colors.line, face: colors.card, shadow: colors.line };
  const textColor = selected ? colors.primaryText : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[label, detail].filter(Boolean).join(', ')}
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
                transform: [{ translateY: pressed ? pressDepth : 0 }],
              },
            ]}
          >
            {emoji ? (
              <AppText variant="heading" style={styles.emoji}>
                {emoji}
              </AppText>
            ) : null}
            <AppText weight="semibold" color={textColor} style={styles.label}>
              {label}
            </AppText>
            {detail ? (
              <AppText variant="label" color={selected ? colors.primaryText : colors.muted}>
                {detail}
              </AppText>
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    minHeight: 60 + pressDepth,
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
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    marginBottom: pressDepth,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  emoji: {
    width: 28,
    textAlign: 'center',
  },
  label: {
    flex: 1,
  },
}));
