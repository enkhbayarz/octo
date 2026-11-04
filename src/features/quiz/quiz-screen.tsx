import { router, useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LottieIcon } from '@/components/lottie-icon';
import { showToast } from '@/components/toast';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import type { Quiz } from '@/course';
import { useShake } from '@/hooks/use-shake';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { useProgress } from '@/progress/store';
import { makeStyles, useColors } from '@/theme/theme';
import { controlHeight, gutter, pressDepth, radius, space } from '@/theme/tokens';

import { AnswerFeedback } from './answer-feedback';
import { AnswerOption, type OptionState } from './answer-option';
import {
  encodeChoices,
  hasUnsavedAnswers,
  initialQuizSession,
  quizSessionReducer,
} from './quiz-session';

const LETTERS = ['A', 'B', 'C', 'D'];

type QuizScreenProps = {
  quiz: Quiz;
  unitNumber: number;
};

export function QuizScreen({ quiz, unitNumber }: QuizScreenProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const submitQuiz = useProgress((state) => state.submitQuiz);
  const [session, dispatch] = useReducer(quizSessionReducer, initialQuizSession);
  // Either one switches the leave guard off; effects below then navigate.
  // (Navigating in the same render would be intercepted by the guard again.)
  const [result, setResult] = useState<{ choices: string; xp: number } | null>(null);
  const [confirmedExit, setConfirmedExit] = useState<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  const { shake, style: shakeStyle } = useShake();

  const total = quiz.questions.length;
  const question = quiz.questions[session.index]!;
  const isLast = session.index === total - 1;
  const isCorrect = session.checked && session.selected === question.answerIndex;

  // Back gesture, Android back and the close button all ask before discarding answers.
  usePreventRemove(hasUnsavedAnswers(session) && !result && !confirmedExit, ({ data }) => {
    Alert.alert(t.quiz.exitTitle, t.quiz.exitBody, [
      { text: t.quiz.stay, style: 'cancel' },
      { text: t.quiz.leave, style: 'destructive', onPress: () => setConfirmedExit(data.action) },
    ]);
  });

  useEffect(() => {
    if (confirmedExit) navigation.dispatch(confirmedExit);
  }, [confirmedExit, navigation]);

  const optionState = (option: number): OptionState => {
    if (!session.checked) return option === session.selected ? 'selected' : 'idle';
    if (option === question.answerIndex) return 'correct';
    return option === session.selected ? 'wrong' : 'dimmed';
  };

  const check = () => {
    if (session.selected === null) {
      shake();
      haptics.warning();
      showToast(t.quiz.pickFirst, 'target');
      return;
    }
    if (session.selected === question.answerIndex) {
      haptics.success();
      playSound('correct');
    } else {
      haptics.error();
      playSound('wrong');
    }
    dispatch({ type: 'check' });
  };

  const next = () => {
    if (!isLast) {
      dispatch({ type: 'next' });
      return;
    }
    const outcome = submitQuiz(quiz.id, session.choices);
    setResult({ choices: encodeChoices(session.choices), xp: outcome.xpGained });
  };

  useEffect(() => {
    if (!result) return;
    router.replace({
      pathname: '/quiz/[id]/result',
      params: { id: quiz.id, choices: result.choices, xp: String(result.xp) },
    });
  }, [result, quiz.id]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton label={t.quiz.exit} onPress={() => router.back()}>
          <LottieIcon name="close-square" color={colors.inkSoft} size={28} />
        </IconButton>
        <View
          style={styles.segments}
          accessible
          accessibilityLabel={t.quiz.questionOf(session.index + 1, total)}
        >
          {quiz.questions.map((_, index) => {
            const done = index < session.index || (index === session.index && session.checked);
            return (
              <View
                key={index}
                style={[
                  styles.segment,
                  done
                    ? styles.segmentDone
                    : index === session.index
                      ? styles.segmentCurrent
                      : null,
                ]}
              />
            );
          })}
        </View>
        <AppText
          variant="label"
          weight="semibold"
          color={colors.inkSoft}
          tabular
          style={styles.count}
        >
          {`${session.index + 1}/${total}`}
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Animated.View
          key={session.index}
          entering={session.index > 0 ? FadeInRight.springify().dampingRatio(1) : undefined}
        >
          <AppText variant="label" weight="semibold" color={colors.primaryText}>
            {t.quiz.kicker(unitNumber, session.index + 1, total)}
          </AppText>
          <AppText variant="title" style={styles.question} accessibilityRole="header">
            {question.text}
          </AppText>
          <View style={styles.options} accessibilityRole="radiogroup">
            {question.options.map((option, index) => (
              <AnswerOption
                key={option}
                letter={LETTERS[index] ?? ''}
                text={option}
                state={optionState(index)}
                locked={session.checked}
                onPress={() => {
                  haptics.tap();
                  dispatch({ type: 'select', option: index });
                }}
              />
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
        {session.checked ? (
          <View style={styles.footerSpacer} />
        ) : (
          <Animated.View style={shakeStyle}>
            <Button label={t.quiz.check} onPress={check} disabled={session.selected === null} />
          </Animated.View>
        )}
      </View>

      {session.checked ? (
        <AnswerFeedback
          correct={isCorrect}
          praise={t.quiz.praise[session.index % t.quiz.praise.length] ?? ''}
          correctAnswer={question.options[question.answerIndex] ?? ''}
          continueLabel={isLast ? t.quiz.seeResults : t.common.continue}
          bottomInset={insets.bottom}
          onContinue={next}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingLeft: space[2],
    paddingRight: gutter,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: space[1],
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.soft,
  },
  segmentDone: {
    backgroundColor: colors.primary,
  },
  segmentCurrent: {
    backgroundColor: colors.primaryMid,
  },
  count: {
    minWidth: 32,
    textAlign: 'right',
  },
  body: {
    paddingTop: space[6],
    paddingHorizontal: gutter,
    paddingBottom: space[10],
  },
  question: {
    marginTop: space[2],
  },
  options: {
    marginTop: space[8],
    gap: space[3],
  },
  footer: {
    paddingTop: space[4],
    paddingHorizontal: gutter,
  },
  footerSpacer: {
    height: controlHeight.button + pressDepth,
  },
}));
