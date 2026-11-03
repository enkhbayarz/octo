import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

import { AppText } from './ui/app-text';
import { Icon } from './ui/icon';

/** Progress is local, so going offline only affects video streaming. Say so. */
export function OfflineBanner() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      style={styles.banner}
      accessibilityRole="alert"
    >
      <Icon name="wifiOff" color={colors.sunText} size={20} />
      <AppText variant="label" weight="semibold" color={colors.sunText} style={styles.text}>
        {t.home.offline}
      </AppText>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginTop: space[3],
    marginHorizontal: gutter,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.sunBorder,
    backgroundColor: colors.sunLight,
  },
  text: {
    flex: 1,
  },
}));
