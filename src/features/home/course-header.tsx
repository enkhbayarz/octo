import { View } from 'react-native';

import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatPill } from '@/components/ui/stat-pill';
import { useCountUp } from '@/hooks/use-count-up';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, gutter, radius, space } from '@/theme/tokens';

type CourseHeaderProps = {
  topInset: number;
  courseTitle: string;
  streak: number;
  /** True when today already counts toward the streak. */
  streakLitToday: boolean;
  xp: number;
  done: number;
  total: number;
  percent: number;
};

export function CourseHeader({
  topInset,
  courseTitle,
  streak,
  streakLitToday,
  xp,
  done,
  total,
  percent,
}: CourseHeaderProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const shownXp = useCountUp(xp);

  return (
    <View style={[styles.header, { paddingTop: topInset + space[2] }]}>
      <View style={styles.row}>
        <View style={styles.course}>
          <View style={styles.flag}>
            <AppText variant="caption" weight="bold" color={colors.white}>
              EN
            </AppText>
          </View>
          <AppText variant="label" weight="semibold">
            {courseTitle}
          </AppText>
        </View>
        <View style={styles.pills}>
          <StatPill
            tone={streakLitToday ? 'fire' : 'plain'}
            accessibilityLabel={t.home.streakLabel(streak)}
            icon={
              <LottieIcon
                name={streakLitToday ? 'fire-1' : 'fire-3'}
                color={streakLitToday ? colors.fire : colors.muted}
                size={20}
                delay={streakLitToday ? 400 : undefined}
              />
            }
            value={streak}
          />
          <StatPill
            accessibilityLabel={t.home.totalXpLabel(xp)}
            icon={
              <LottieIcon
                name="flash"
                color={colors.sunDark}
                size={20}
                playKey={shownXp === xp ? xp : 0}
              />
            }
            value={shownXp}
          />
        </View>
      </View>
      <View style={styles.progressLabel}>
        <AppText variant="label" color={colors.inkSoft}>
          {t.home.courseProgress}
        </AppText>
        <AppText variant="label" weight="bold" tabular>
          {t.home.lessonsProgress(done, total, percent)}
        </AppText>
      </View>
      <ProgressBar percent={percent} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  header: {
    paddingHorizontal: gutter,
    paddingBottom: space[4],
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  course: {
    height: controlHeight.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingLeft: space[1],
    paddingRight: space[3],
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  flag: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: {
    flexDirection: 'row',
    gap: space[2],
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space[4],
    marginBottom: space[2],
  },
}));
