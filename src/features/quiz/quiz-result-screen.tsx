import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Confetti } from '@/components/confetti';
import { Mascot } from '@/components/mascot';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ProgressRing } from '@/components/ui/progress-ring';
import { XpChip } from '@/components/xp-chip';
import type { Quiz } from '@/course';
import { course } from '@/course';
import { useT } from '@/i18n';
import { toPercent } from '@/lib/format';
import { playSound } from '@/lib/sounds';
import { isPassingScore } from '@/progress/rules';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, gutter, radius, space } from '@/theme/tokens';

import { encodeChoices, scoreChoices } from './quiz-session';

type QuizResultScreenProps = {
  quiz: Quiz;
  unitIndex: number;
  choices: number[];
  xpGained: number;
};

export function QuizResultScreen({ quiz, unitIndex, choices, xpGained }: QuizResultScreenProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const answers = scoreChoices(quiz.questions, choices);
  const total = answers.length;
  const correct = answers.filter(Boolean).length;
  const percent = toPercent(correct, total);
  const passed = isPassingScore(correct, total, quiz.passPercent);
  const needed = Math.ceil((quiz.passPercent / 100) * total);
  const isLastUnit = unitIndex === course.units.length - 1;

  const note = passed
    ? isLastUnit
      ? t.result.allUnitsDone
      : t.result.nextUnitOpen(unitIndex + 2)
    : t.result.passNeeds(quiz.passPercent, needed, total);

  const mistakes = total - correct;

  useEffect(() => {
    playSound(passed ? 'complete' : 'wrong');
  }, [passed]);

  const retry = () => router.replace({ pathname: '/quiz/[id]', params: { id: quiz.id } });
  const home = () => router.dismissTo('/');
  const review = () =>
    router.push({
      pathname: '/quiz/[id]/review',
      params: { id: quiz.id, choices: encodeChoices(choices) },
    });

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {passed ? <Confetti /> : null}
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.springify().dampingRatio(0.6)} style={styles.mascot}>
          <Mascot mood={passed ? 'joy' : 'sad'} size={112} />
        </Animated.View>
        <AppText variant="display" align="center" accessibilityRole="header">
          {passed ? t.result.passed : t.result.failed}
        </AppText>
        <AppText color={colors.inkSoft} align="center" style={styles.subtitle}>
          {t.result.unitQuiz(unitIndex + 1)}
        </AppText>

        <Animated.View
          entering={FadeInDown.delay(300).springify()}
          style={styles.card}
          accessible
          accessibilityLabel={t.result.scoreLabel(correct, total, percent)}
        >
          <ProgressRing
            percent={percent}
            size={88}
            stroke={8}
            color={passed ? colors.success : colors.danger}
            trackColor={colors.soft}
            animate
          >
            <AppText variant="heading" tabular>{`${percent}%`}</AppText>
          </ProgressRing>
          <View>
            <AppText variant="title" tabular>{`${correct} / ${total}`}</AppText>
            <AppText variant="label" color={colors.muted}>
              {t.result.correctAnswers}
            </AppText>
            <View style={styles.dots}>
              {answers.map((answer, index) => (
                <View
                  key={index}
                  style={[styles.dot, { backgroundColor: answer ? colors.success : colors.danger }]}
                >
                  <Icon name={answer ? 'check' : 'close'} color={colors.white} size={12} />
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {xpGained > 0 ? <XpChip amount={xpGained} /> : null}
        <AppText variant="label" color={colors.inkSoft} align="center" style={styles.note}>
          {note}
        </AppText>
        <Pressable
          onPress={review}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.reviewLink, pressed && styles.reviewLinkPressed]}
        >
          <AppText variant="label" weight="semibold" color={colors.primaryText}>
            {mistakes > 0 ? t.result.reviewMistakes(mistakes) : t.result.reviewAll}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.footer}>
        {passed ? (
          <>
            <Button label={t.common.continue} onPress={home} />
            <Button label={t.result.retake} tone="secondary" onPress={retry} />
          </>
        ) : (
          <>
            <Button label={t.result.retake} onPress={retry} />
            <Button label={t.common.backHome} tone="secondary" onPress={home} />
          </>
        )}
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
  mascot: {
    marginBottom: space[2],
  },
  reviewLink: {
    minHeight: controlHeight.control,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    marginTop: space[2],
    borderRadius: radius.full,
  },
  reviewLinkPressed: {
    backgroundColor: colors.primaryLight,
  },
  subtitle: {
    marginTop: space[2],
  },
  card: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    marginTop: space[6],
    padding: space[5],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  dots: {
    flexDirection: 'row',
    gap: space[1],
    marginTop: space[2],
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    marginTop: space[4],
    maxWidth: 300,
  },
  footer: {
    gap: space[3],
    paddingTop: space[4],
    paddingHorizontal: gutter,
    paddingBottom: space[4],
  },
}));
