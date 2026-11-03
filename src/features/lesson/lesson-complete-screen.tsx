import { router } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/confetti';
import { LottieIcon } from '@/components/lottie-icon';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { XpChip } from '@/components/xp-chip';
import { type Lesson, pathItems } from '@/course';
import { localize, useLocale, useT } from '@/i18n';
import { today } from '@/lib/dates';
import { playSound } from '@/lib/sounds';
import { currentStreak } from '@/progress/rules';
import { getActiveItem, getCourseProgress } from '@/progress/selectors';
import { useProgress } from '@/progress/store';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

import { CompletionMedal } from './completion-medal';

type LessonCompleteScreenProps = {
  lesson: Lesson;
  xpGained: number;
  streakIncreased: boolean;
};

function SummaryStat({
  icon,
  value,
  label,
  highlight,
  delay,
}: {
  icon?: ReactNode;
  value: string | number;
  label: string;
  highlight?: boolean;
  delay: number;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={[styles.stat, highlight && styles.statHighlight]}
    >
      <View style={styles.statValue}>
        {icon}
        <AppText variant="heading" tabular color={highlight ? colors.fireText : colors.ink}>
          {value}
        </AppText>
      </View>
      <AppText variant="caption" weight="medium" color={colors.muted} numberOfLines={1}>
        {label}
      </AppText>
    </Animated.View>
  );
}

export function LessonCompleteScreen({
  lesson,
  xpGained,
  streakIncreased,
}: LessonCompleteScreenProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const progress = useProgress();
  const next = getActiveItem(pathItems, progress);
  const { percent } = getCourseProgress(progress);
  const streak = currentStreak(progress, today());

  useEffect(() => {
    playSound('complete');
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Confetti />
      <View style={styles.center}>
        <CompletionMedal />
        <AppText variant="display" align="center" accessibilityRole="header">
          {t.lessonDone.title}
        </AppText>
        <AppText color={colors.inkSoft} align="center" style={styles.subtitle}>
          {t.lessonDone.subtitle(localize(lesson.title, locale))}
        </AppText>
        {xpGained > 0 ? <XpChip amount={xpGained} /> : null}

        <View style={styles.stats}>
          <SummaryStat
            delay={600}
            highlight={streakIncreased}
            icon={
              <LottieIcon
                name="fire-1"
                color={colors.fire}
                size={20}
                delay={streakIncreased ? 1050 : 750}
              />
            }
            value={streak}
            label={streakIncreased ? t.lessonDone.streakUp : t.lessonDone.streakDays}
          />
          <SummaryStat
            delay={680}
            icon={<LottieIcon name="flash" color={colors.sunDark} size={20} delay={850} />}
            value={progress.xp}
            label={t.lessonDone.totalXp}
          />
          <SummaryStat delay={760} value={`${percent}%`} label={t.lessonDone.progress} />
        </View>

        {next ? (
          <Animated.View
            entering={FadeInDown.delay(900).springify()}
            style={[styles.next, next.kind === 'quiz' && styles.nextQuiz]}
          >
            <View style={[styles.nextIcon, next.kind === 'quiz' && styles.nextIconQuiz]}>
              <LottieIcon
                name={next.kind === 'quiz' ? 'star' : 'play-square'}
                color={colors.white}
                size={24}
                delay={1100}
              />
            </View>
            <View style={styles.nextText}>
              <AppText
                variant="caption"
                color={next.kind === 'quiz' ? colors.sunText : colors.primaryText}
              >
                {next.kind === 'quiz' ? t.lessonDone.quizUnlocked : t.lessonDone.nextLesson}
              </AppText>
              <AppText weight="semibold">
                {next.kind === 'quiz'
                  ? t.lessonDone.quizSummary(next.unitIndex + 1, next.quiz.questions.length)
                  : localize(next.lesson.title, locale)}
              </AppText>
            </View>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button label={t.common.continue} onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: gutter,
  },
  subtitle: {
    marginTop: space[2],
    maxWidth: 300,
  },
  stats: {
    flexDirection: 'row',
    gap: space[3],
    marginTop: space[6],
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: space[1],
    paddingVertical: space[4],
    paddingHorizontal: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  statHighlight: {
    borderColor: colors.fireBorder,
    backgroundColor: colors.fireLight,
  },
  statValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  next: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginTop: space[4],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  nextQuiz: {
    backgroundColor: colors.sunLight,
  },
  nextIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextIconQuiz: {
    backgroundColor: colors.sun,
  },
  nextText: {
    flex: 1,
  },
  footer: {
    paddingTop: space[4],
    paddingHorizontal: gutter,
    paddingBottom: space[4],
  },
}));
