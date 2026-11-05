import { Pressable, View } from 'react-native';

import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatPill } from '@/components/ui/stat-pill';
import { useCountUp } from '@/hooks/use-count-up';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
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
  /** Which pill's panel is open. */
  panel: HeaderPanel | null;
  onPanel: (panel: HeaderPanel | null) => void;
};

export type HeaderPanel = 'course' | 'streak' | 'xp';

export function CourseHeader({
  topInset,
  courseTitle,
  streak,
  streakLitToday,
  xp,
  done,
  total,
  percent,
  panel,
  onPanel,
}: CourseHeaderProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const shownXp = useCountUp(xp);
  // A second tap on the same pill closes its panel.
  const toggle = (next: HeaderPanel) => () => {
    haptics.tap();
    onPanel(panel === next ? null : next);
  };

  return (
    <View style={[styles.header, { paddingTop: topInset + space[2] }]}>
      <View style={styles.row}>
        <Pressable
          onPress={toggle('course')}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityState={{ expanded: panel === 'course' }}
          style={({ pressed }) => [
            styles.course,
            (pressed || panel === 'course') && styles.courseActive,
          ]}
        >
          <AppText variant="label" weight="semibold">
            {courseTitle}
          </AppText>
        </Pressable>
        <View style={styles.pills}>
          <StatPill
            tone={streakLitToday ? 'fire' : 'plain'}
            onPress={toggle('streak')}
            expanded={panel === 'streak'}
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
            onPress={toggle('xp')}
            expanded={panel === 'xp'}
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
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  courseActive: {
    borderColor: colors.inkSoft,
    transform: [{ scale: 0.96 }],
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
