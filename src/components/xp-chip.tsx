import Animated, { FadeInDown } from 'react-native-reanimated';

import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, radius, space } from '@/theme/tokens';

import { LottieIcon } from './lottie-icon';
import { AppText } from './ui/app-text';

/** "+10 XP" reward chip on the celebration screens. */
export function XpChip({ amount, delay = 500 }: { amount: number; delay?: number }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={styles.chip}>
      <LottieIcon name="flash" color={colors.sunDark} size={20} delay={delay + 150} />
      <AppText weight="bold" color={colors.sunText} tabular>
        {`+${amount} XP`}
      </AppText>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  chip: {
    height: controlHeight.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    marginTop: space[4],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.sunBorder,
    backgroundColor: colors.sunLight,
  },
}));
