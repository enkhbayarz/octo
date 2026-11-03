import { View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { AppText } from '@/components/ui/app-text';
import { makeStyles } from '@/theme/theme';
import { radius, space } from '@/theme/tokens';

type OctoSaysProps = {
  text: string;
  /** "row": small Окто beside the bubble (questions). "stacked": bubble above a big Окто. */
  layout?: 'row' | 'stacked';
};

/** Окто asking something in a speech bubble, like Duo in Duolingo's onboarding. */
export function OctoSays({ text, layout = 'row' }: OctoSaysProps) {
  const styles = useStyles();
  const stacked = layout === 'stacked';

  return (
    <View style={stacked ? styles.stacked : styles.row}>
      {stacked ? null : <Mascot mood="happy" size={88} />}
      <View style={[styles.bubble, stacked ? styles.bubbleStacked : styles.bubbleRow]}>
        <View style={[styles.tail, stacked ? styles.tailDown : styles.tailLeft]} />
        <AppText
          variant={stacked ? 'heading' : 'body'}
          weight="semibold"
          align={stacked ? 'center' : undefined}
          accessibilityRole="header"
        >
          {text}
        </AppText>
      </View>
      {stacked ? <Mascot mood="joy" size={168} floating /> : null}
    </View>
  );
}

const TAIL = 14;

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  stacked: {
    alignItems: 'center',
    gap: space[5],
  },
  bubble: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  bubbleRow: {
    flex: 1,
  },
  bubbleStacked: {
    maxWidth: 320,
  },
  // A rotated square whose two outer edges carry the bubble's border.
  tail: {
    position: 'absolute',
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.card,
    borderColor: colors.line,
    transform: [{ rotate: '45deg' }],
  },
  tailLeft: {
    left: -TAIL / 2 - 1,
    top: '50%',
    marginTop: -TAIL / 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
  },
  tailDown: {
    bottom: -TAIL / 2 - 1,
    left: '50%',
    marginLeft: -TAIL / 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
}));
