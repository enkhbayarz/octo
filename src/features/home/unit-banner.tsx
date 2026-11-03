import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { ProgressRing } from '@/components/ui/progress-ring';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

type UnitBannerProps = {
  number: number;
  title: string;
  meta: string;
  /** Omit for an upcoming unit. */
  progress?: { done: number; total: number };
};

/** Sticky unit header. Its paper backdrop hides the path scrolling underneath. */
export function UnitBanner({ number, title, meta, progress }: UnitBannerProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const upcoming = !progress;
  const complete = progress && progress.done === progress.total;
  const textColor = upcoming ? colors.inkSoft : colors.white;

  return (
    <View style={styles.backdrop}>
      <View style={[styles.banner, upcoming && styles.upcoming]} accessibilityRole="header">
        <View style={styles.text}>
          <AppText variant="caption" weight="bold" color={textColor} style={styles.kicker}>
            {t.home.unitKicker(number)}
          </AppText>
          <AppText variant="heading" color={textColor}>
            {title}
          </AppText>
          <AppText variant="label" color={textColor} style={styles.meta}>
            {meta}
          </AppText>
        </View>
        {upcoming ? (
          <View style={styles.soon}>
            <AppText variant="caption" weight="bold" color={colors.inkSoft}>
              {t.home.comingSoon}
            </AppText>
          </View>
        ) : complete ? (
          <View style={styles.check} accessibilityLabel={t.home.unitDone}>
            <Icon name="check" color={colors.white} />
          </View>
        ) : (
          <ProgressRing
            percent={(progress.done / progress.total) * 100}
            size={48}
            stroke={5}
            color={colors.sun}
            trackColor="rgba(255, 255, 255, 0.25)"
          >
            <AppText variant="caption" weight="bold" color={colors.white} tabular>
              {`${progress.done}/${progress.total}`}
            </AppText>
          </ProgressRing>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: {
    backgroundColor: colors.paper,
    paddingTop: space[3],
    paddingHorizontal: gutter,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[5],
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    boxShadow: `0 4px 0 ${colors.primaryShadow}`,
    marginBottom: 4,
  },
  upcoming: {
    backgroundColor: colors.lock,
    boxShadow: `0 4px 0 ${colors.lockDark}`,
  },
  text: {
    flex: 1,
  },
  kicker: {
    letterSpacing: 1,
    opacity: 0.8,
  },
  meta: {
    marginTop: space[1],
    opacity: 0.85,
  },
  soon: {
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  check: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
