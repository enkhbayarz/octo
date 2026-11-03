import Constants from 'expo-constants';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usesGlassTabBar, useTabBarInset } from '@/components/glass-tab-bar';
import { LottieIcon, type LottieIconName } from '@/components/lottie-icon';
import { showToast } from '@/components/toast';
import { appVersionLabel } from '@/components/update-banner';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProgressRing } from '@/components/ui/progress-ring';
import { quizCount } from '@/course';
import { useT } from '@/i18n';
import { fromDayKey, today } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { currentStreak } from '@/progress/rules';
import {
  getCourseProgress,
  getProfileStats,
  getWeeklyActivity,
  XP_PER_LEVEL,
} from '@/progress/selectors';
import { useProgress } from '@/progress/store';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, gutter, radius, space } from '@/theme/tokens';

import { SettingsCard } from './settings-card';
import { StatTile } from './stat-tile';
import { WeeklyChart } from './weekly-chart';

const MEDALS: LottieIconName[] = ['medal-2', 'medal-3', 'medal-4'];

export function ProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const progress = useProgress();
  const reset = useProgress((state) => state.reset);
  const day = today();
  const streak = currentStreak(progress, day);
  const course = getCourseProgress(progress);
  const stats = getProfileStats(progress);
  const joined = fromDayKey(progress.joinedOn);

  const confirmReset = () => {
    haptics.warning();
    Alert.alert(t.profile.resetTitle, t.profile.resetBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.profile.resetConfirm,
        style: 'destructive',
        onPress: () => {
          reset();
          showToast(t.profile.resetDone, 'refresh');
        },
      },
    ]);
  };

  return (
    // Not collapsable, so native tabs still find the ScrollView for their insets.
    <View style={styles.screen} collapsable={false}>
      <ScrollView
        style={styles.screen}
        // iOS native tabs already inset the first ScrollView for the status bar; Android and the
        // glass tab bar don't.
        contentContainerStyle={{
          paddingTop: (Platform.OS === 'ios' && !usesGlassTabBar ? 0 : insets.top) + space[6],
          paddingBottom: tabBarInset + space[10],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <View
            style={styles.avatar}
            accessibilityLabel={t.profile.avatarLabel(progress.learnerName, stats.level)}
          >
            <AppText variant="display" color={colors.white}>
              {progress.learnerName.charAt(0)}
            </AppText>
            <View style={styles.level}>
              <Icon name="star" color="#5A3E00" size={12} />
              <AppText variant="caption" weight="bold" color="#5A3E00">
                {stats.level}
              </AppText>
            </View>
          </View>
          <AppText variant="title" style={styles.name} accessibilityRole="header">
            {progress.learnerName}
          </AppText>
          <AppText variant="label" color={colors.muted}>
            {t.profile.learningSince(joined.getFullYear(), joined.getMonth() + 1)}
          </AppText>

          <View style={styles.levelCard}>
            <View style={styles.levelRow}>
              <View style={styles.levelLabel}>
                <LottieIcon
                  name={MEDALS[Math.min(MEDALS.length - 1, stats.level - 1)]!}
                  color={colors.sunDark}
                  size={20}
                  delay={200}
                />
                <AppText variant="label" weight="semibold" color={colors.inkSoft}>
                  {t.profile.level(stats.level)}
                </AppText>
              </View>
              <AppText variant="label" weight="semibold" color={colors.inkSoft} tabular>
                {`${stats.xpIntoLevel} / ${XP_PER_LEVEL} XP`}
              </AppText>
            </View>
            <ProgressBar percent={(stats.xpIntoLevel / XP_PER_LEVEL) * 100} color={colors.sun} />
          </View>
        </View>

        <View style={styles.grid}>
          <StatTile
            tone="fire"
            icon={(color) => (
              <LottieIcon name={streak ? 'fire-1' : 'fire-3'} color={color} delay={300} />
            )}
            value={t.profile.days(streak)}
            label={t.profile.streak}
          />
          <StatTile
            tone="sun"
            icon={(color) => <LottieIcon name="flash" color={color} delay={400} />}
            value={progress.xp}
            label={t.profile.totalXp}
          />
          <StatTile
            tone="primary"
            icon={(color) => <LottieIcon name="video-badge" color={color} delay={500} />}
            value={`${course.done} / ${course.total}`}
            label={t.profile.lessonsDone}
          />
          <StatTile
            tone="success"
            icon={(color) => <LottieIcon name="star" color={color} delay={600} />}
            value={`${stats.quizzesPassed} / ${quizCount}`}
            label={t.profile.quizzesPassed}
          />
          <StatTile
            tone="sky"
            icon={(color) => <LottieIcon name="target" color={color} delay={700} />}
            value={stats.averageScore === null ? '—' : `${stats.averageScore}%`}
            label={t.profile.quizAverage}
          />
          <StatTile
            tone="primary"
            icon={(color) => (
              <ProgressRing
                percent={course.percent}
                size={20}
                stroke={3.5}
                color={color}
                trackColor={colors.primaryMid}
              />
            )}
            value={`${course.percent}%`}
            label={t.profile.courseProgress}
          />
        </View>

        <WeeklyChart days={getWeeklyActivity(progress, day)} />

        <SettingsCard />

        <Pressable
          onPress={confirmReset}
          accessibilityRole="button"
          style={({ pressed }) => [styles.reset, pressed && styles.resetPressed]}
        >
          <LottieIcon name="refresh" color={colors.dangerDark} size={20} />
          <AppText weight="semibold" color={colors.dangerDark}>
            {t.profile.reset}
          </AppText>
        </Pressable>
        <AppText variant="caption" weight="medium" color={colors.muted} align="center">
          {appVersionLabel(t.profile.version(Constants.expoConfig?.version ?? '—'))}
        </AppText>
      </ScrollView>
      {/* Keeps scrolled content from running under the clock and battery. */}
      <View style={[styles.statusBar, { height: insets.top }]} pointerEvents="none" />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.paper,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  head: {
    alignItems: 'center',
    paddingHorizontal: gutter,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 6px 0 ${colors.primaryShadow}`,
  },
  level: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    paddingHorizontal: space[2],
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.paper,
    backgroundColor: colors.sun,
  },
  name: {
    marginTop: space[4],
  },
  levelCard: {
    alignSelf: 'stretch',
    gap: space[3],
    marginTop: space[6],
    padding: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
    paddingTop: space[3],
    paddingHorizontal: gutter,
  },
  reset: {
    height: controlHeight.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    margin: gutter,
    marginTop: space[6],
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.dangerBorder,
  },
  resetPressed: {
    backgroundColor: colors.dangerLight,
  },
}));
