import { Pressable, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { LottieIcon } from '@/components/lottie-icon';
import { Mascot } from '@/components/mascot';
import { showToast } from '@/components/toast';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { ProgressRing } from '@/components/ui/progress-ring';
import { useCountUp } from '@/hooks/use-count-up';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, type Palette, radius, space } from '@/theme/tokens';

import { hoursLeftToday, streakMilestone } from './streak-goals';

const MAX_SEGMENTS = 10;
const BAR_HEIGHT = 48;

/** The one color a card is accented with: icon and fills, colored text, and a tint. */
type Accent = { fill: string; text: string; tint: string };

const accents = (colors: Palette) => ({
  streakLit: { fill: colors.fire, text: colors.fireText, tint: colors.fireLight },
  streakRisk: { fill: colors.danger, text: colors.dangerText, tint: colors.dangerLight },
  streakStart: { fill: colors.sky, text: colors.sky, tint: colors.skyLight },
  xp: { fill: colors.sun, text: colors.sunText, tint: colors.sunLight },
});

/** One of the last 7 days, oldest first (see getWeeklyActivity). */
export type WeekDay = {
  day: string;
  weekday: number;
  isToday: boolean;
  xp: number;
  /** Studied that day, even if it earned no XP (a failed quiz). */
  active: boolean;
};

/** A row of segments that fill in one by one, ending in the next milestone. */
function SegmentTrack({
  accent,
  fraction,
  steps,
  goal,
}: {
  accent: Accent;
  /** 0–1 */
  fraction: number;
  /** How many steps the track has; capped at 10 segments. */
  steps: number;
  goal: number;
}) {
  const styles = useStyles();
  const segments = Math.max(1, Math.min(steps, MAX_SEGMENTS));
  const filled = Math.floor(Math.min(1, Math.max(0, fraction)) * segments);
  return (
    <View style={styles.track}>
      {Array.from({ length: segments }, (_, index) => (
        <View key={index} style={styles.segment}>
          {index < filled ? (
            <Animated.View
              entering={ZoomIn.delay(300 + index * 70).springify()}
              style={[styles.segmentFill, { backgroundColor: accent.fill }]}
            />
          ) : null}
        </View>
      ))}
      <View style={[styles.goal, { backgroundColor: accent.tint, borderColor: accent.fill }]}>
        <LottieIcon name="fire-1" color={accent.fill} size={14} />
        <AppText variant="caption" weight="bold" color={accent.text} tabular>
          {goal}
        </AppText>
      </View>
    </View>
  );
}

/** Short status in the card's color, under the big number. */
function Status({ accent, text }: { accent: Accent; text: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.status, { backgroundColor: accent.tint }]}>
      <AppText variant="label" weight="bold" color={accent.text}>
        {text}
      </AppText>
    </View>
  );
}

type StreakCardProps = {
  streak: number;
  litToday: boolean;
  week: WeekDay[];
};

/** Tapped from the 🔥 pill: the streak, this week's days, and the next milestone. */
export function StreakCard({ streak, litToday, week }: StreakCardProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const shown = useCountUp(streak, 700, 0);
  const { from, to } = streakMilestone(streak);
  const accent = accents(colors);

  const state = litToday
    ? { accent: accent.streakLit, mood: 'joy' as const, status: t.streakCard.lit }
    : streak > 0
      ? {
          accent: accent.streakRisk,
          mood: 'sad' as const,
          status: t.streakCard.risk(hoursLeftToday(new Date())),
        }
      : { accent: accent.streakStart, mood: 'happy' as const, status: t.streakCard.start };

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <View style={styles.big} accessible accessibilityLabel={t.home.streakLabel(streak)}>
            <LottieIcon name={litToday ? 'fire-1' : 'fire-3'} color={state.accent.fill} size={44} />
            <AppText variant="display" color={state.accent.text} tabular>
              {t.profile.days(shown)}
            </AppText>
          </View>
          <Status accent={state.accent} text={state.status} />
        </View>
        <Mascot mood={state.mood} size={80} floating />
      </View>

      <View style={styles.week}>
        {week.map((day, index) => (
          <View
            key={day.day}
            style={styles.weekDay}
            accessible
            accessibilityLabel={t.profile.weekdays[day.weekday]}
            accessibilityState={{ checked: day.active }}
          >
            {day.active ? (
              <Animated.View
                entering={ZoomIn.delay(150 + index * 60).springify()}
                style={[styles.dot, { backgroundColor: state.accent.fill }]}
              >
                <Icon name="check" color={colors.white} size={16} />
              </Animated.View>
            ) : (
              <View
                style={[
                  styles.dot,
                  day.isToday
                    ? [styles.dotToday, { borderColor: state.accent.fill }]
                    : styles.dotOff,
                ]}
              />
            )}
            <AppText
              variant="caption"
              color={day.isToday ? state.accent.text : colors.muted}
              weight={day.isToday ? 'bold' : 'semibold'}
            >
              {t.profile.weekdays[day.weekday]}
            </AppText>
          </View>
        ))}
      </View>

      <SegmentTrack
        accent={state.accent}
        fraction={(streak - from) / (to - from)}
        steps={to - from}
        goal={to}
      />
    </View>
  );
}

type XpCardProps = {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  week: WeekDay[];
};

/** Tapped from the ⚡ pill: total XP, the level filling up, and this week's XP. */
export function XpCard({ xp, level, xpIntoLevel, xpPerLevel, week }: XpCardProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const accent = accents(colors).xp;
  const shown = useCountUp(xp, 700, 0);
  const today = week.find((day) => day.isToday)?.xp ?? 0;
  const best = Math.max(1, ...week.map((day) => day.xp));

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <View style={styles.big} accessible accessibilityLabel={t.home.totalXpLabel(xp)}>
            <LottieIcon name="flash" color={colors.sunDark} size={44} />
            <AppText variant="display" color={accent.text} tabular>
              {`${shown} XP`}
            </AppText>
          </View>
          <Status accent={accent} text={t.xpCard.today(today)} />
        </View>
        <View
          accessible
          accessibilityLabel={`${t.profile.level(level)}. ${t.xpCard.toNext(xpPerLevel - xpIntoLevel, level + 1)}`}
        >
          <ProgressRing
            percent={(xpIntoLevel / xpPerLevel) * 100}
            size={80}
            stroke={8}
            color={colors.sun}
            trackColor={colors.soft}
            animate
          >
            <Icon name="star" color={colors.sunDark} size={14} />
            <AppText variant="heading" color={accent.text} tabular>
              {level}
            </AppText>
          </ProgressRing>
        </View>
      </View>

      <View style={styles.bars}>
        {week.map((day, index) => (
          <View
            key={day.day}
            style={styles.barColumn}
            accessible
            accessibilityLabel={`${day.isToday ? t.profile.today : t.profile.weekdays[day.weekday]}: ${day.xp} XP`}
          >
            <View style={styles.barSlot}>
              <Animated.View
                entering={ZoomIn.delay(150 + index * 50).springify()}
                style={[
                  styles.bar,
                  {
                    height: Math.max(6, (day.xp / best) * BAR_HEIGHT),
                    backgroundColor: day.isToday ? accent.fill : accent.tint,
                  },
                ]}
              />
            </View>
            <AppText
              variant="caption"
              color={day.isToday ? accent.text : colors.muted}
              weight={day.isToday ? 'bold' : 'semibold'}
            >
              {t.profile.weekdays[day.weekday]}
            </AppText>
          </View>
        ))}
      </View>

      <AppText variant="caption" color={colors.muted} style={styles.hint} tabular>
        {t.xpCard.toNext(xpPerLevel - xpIntoLevel, level + 1)}
      </AppText>
    </View>
  );
}

type CoursePickerProps = {
  title: string;
  progress: string;
};

/** Tapped from the course pill: the course being learned, and the languages coming next. */
export function CoursePicker({ title, progress }: CoursePickerProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const upcoming = [
    { code: 'KO', name: t.courses.korean },
    { code: 'JA', name: t.courses.japanese },
    { code: 'ZH', name: t.courses.chinese },
    { code: 'RU', name: t.courses.russian },
  ];

  return (
    <View style={[styles.card, styles.picker]}>
      <AppText variant="caption" color={colors.muted} style={styles.pickerTitle}>
        {t.courses.title}
      </AppText>

      <View
        style={[styles.row, styles.rowCurrent]}
        accessible
        accessibilityState={{ selected: true }}
      >
        <View style={[styles.code, { backgroundColor: colors.primary }]}>
          <AppText variant="caption" weight="bold" color={colors.white}>
            EN
          </AppText>
        </View>
        <View style={styles.rowText}>
          <AppText weight="bold" color={colors.primaryText}>
            {title}
          </AppText>
          <AppText variant="caption" weight="medium" color={colors.inkSoft} tabular>
            {progress}
          </AppText>
        </View>
        <Icon name="check" color={colors.primary} size={20} />
      </View>

      {upcoming.map((language, index) => (
        <Animated.View key={language.code} entering={ZoomIn.delay(80 + index * 50)}>
          <Pressable
            onPress={() => {
              haptics.warning();
              showToast(t.courses.soonToast(language.name), 'lock-3');
            }}
            accessibilityRole="button"
            accessibilityLabel={`${language.name}, ${t.home.comingSoon}`}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={[styles.code, { backgroundColor: colors.lock }]}>
              <AppText variant="caption" weight="bold" color={colors.muted}>
                {language.code}
              </AppText>
            </View>
            <AppText weight="semibold" color={colors.inkSoft} style={styles.rowText}>
              {language.name}
            </AppText>
            <View style={styles.soon}>
              <AppText variant="caption" color={colors.muted}>
                {t.home.comingSoon}
              </AppText>
            </View>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    padding: space[5],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    boxShadow: `0 8px 24px ${colors.shadow}`,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  heroText: {
    flex: 1,
    alignItems: 'flex-start',
    gap: space[2],
  },
  big: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    marginLeft: -space[2],
  },
  status: {
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.full,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space[5],
    marginBottom: space[5],
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    gap: space[1],
  },
  dot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  dotOff: {
    backgroundColor: colors.soft,
  },
  dotToday: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  segment: {
    flex: 1,
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: colors.soft,
  },
  segmentFill: {
    flex: 1,
    borderRadius: radius.full,
  },
  goal: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: space[1],
    paddingHorizontal: space[2],
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  bars: {
    flexDirection: 'row',
    gap: space[2],
    marginTop: space[5],
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: space[1],
  },
  barSlot: {
    height: BAR_HEIGHT,
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: radius.xs,
  },
  hint: {
    marginTop: space[4],
    textAlign: 'center',
  },
  picker: {
    padding: space[3],
    gap: space[1],
  },
  pickerTitle: {
    marginHorizontal: space[2],
    marginTop: space[1],
    marginBottom: space[1],
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  row: {
    minHeight: controlHeight.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  rowCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  rowPressed: {
    backgroundColor: colors.soft,
  },
  rowText: {
    flex: 1,
  },
  code: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  soon: {
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.full,
    backgroundColor: colors.soft,
  },
}));
