import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

type Day = { day: string; xp: number; weekday: number; isToday: boolean };

const MAX_BAR = 88;

export function WeeklyChart({ days }: { days: Day[] }) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  // Scaled to the week's best day, so it always reaches the top: progress should feel big.
  const max = Math.max(1, ...days.map((day) => day.xp));
  const weekTotal = days.reduce((sum, day) => sum + day.xp, 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.title}>
          <LottieIcon name="calendar" color={colors.primary} size={20} delay={800} />
          <AppText weight="bold">{t.profile.thisWeek}</AppText>
        </View>
        <AppText variant="label" weight="semibold" color={colors.primaryText} tabular>
          {`${weekTotal} XP`}
        </AppText>
      </View>
      <View style={styles.chart}>
        {days.map((day, index) => (
          <View
            key={day.day}
            style={styles.column}
            accessible
            accessibilityLabel={`${day.isToday ? t.profile.today : t.profile.weekdays[day.weekday]}: ${day.xp} XP`}
          >
            <AppText
              variant="caption"
              color={day.isToday ? colors.primaryText : colors.inkSoft}
              tabular
            >
              {day.xp || day.isToday ? String(day.xp) : ' '}
            </AppText>
            <Animated.View
              entering={FadeInDown.delay(index * 55).springify()}
              style={[
                styles.bar,
                { height: Math.max(8, (day.xp / max) * MAX_BAR) },
                day.isToday && styles.barToday,
              ]}
            />
            <AppText variant="caption" color={day.isToday ? colors.primaryText : colors.muted}>
              {t.profile.weekdays[day.weekday]}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    marginTop: space[3],
    marginHorizontal: gutter,
    padding: space[5],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  chart: {
    height: 128,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space[2],
    marginTop: space[4],
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space[1],
  },
  bar: {
    alignSelf: 'stretch',
    borderRadius: radius.xs,
    backgroundColor: colors.primaryLight,
  },
  barToday: {
    backgroundColor: colors.primary,
  },
}));
