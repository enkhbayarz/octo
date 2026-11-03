import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useT } from '@/i18n';
import type { Quiz } from '@/course';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

import { scoreChoices } from './quiz-session';

type QuizReviewScreenProps = {
  quiz: Quiz;
  choices: number[];
};

/**
 * Native sheet listing every question with the learner's answer and, when it was
 * wrong, the right one. Mistakes come first: that's what is worth re-reading.
 */
export function QuizReviewScreen({ quiz, choices }: QuizReviewScreenProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  const answers = scoreChoices(quiz.questions, choices);
  const rows = quiz.questions
    .map((question, index) => ({ question, index, correct: answers[index] ?? false }))
    .sort((a, b) => Number(a.correct) - Number(b.correct));
  const mistakes = answers.filter((answer) => !answer).length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <AppText variant="heading" accessibilityRole="header">
          {t.review.title}
        </AppText>
        <AppText variant="label" color={colors.inkSoft}>
          {mistakes > 0 ? t.review.mistakes(mistakes) : t.review.allCorrect}
        </AppText>
      </View>

      {rows.map(({ question, index, correct }) => {
        const picked = question.options[choices[index] ?? -1] ?? '';
        const right = question.options[question.answerIndex] ?? '';
        return (
          <View
            key={index}
            style={[styles.card, correct ? styles.cardCorrect : styles.cardWrong]}
            accessible
            accessibilityLabel={t.review.a11y(
              index + 1,
              question.text,
              picked,
              correct ? null : right,
            )}
          >
            <View style={styles.header}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: correct ? colors.success : colors.danger },
                ]}
              >
                <Icon name={correct ? 'check' : 'close'} color={colors.white} size={14} />
              </View>
              <AppText variant="caption" color={colors.muted}>
                {t.review.question(index + 1)}
              </AppText>
            </View>
            <AppText weight="semibold">{question.text}</AppText>
            <View style={styles.answer}>
              <AppText variant="label" color={colors.muted}>
                {t.review.yourAnswer}
              </AppText>
              <AppText
                variant="label"
                weight="semibold"
                color={correct ? colors.successText : colors.dangerText}
              >
                {picked}
              </AppText>
            </View>
            {correct ? null : (
              <View style={styles.answer}>
                <AppText variant="label" color={colors.muted}>
                  {t.review.correctAnswer}
                </AppText>
                <AppText variant="label" weight="semibold" color={colors.successText}>
                  {right}
                </AppText>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: {
    paddingTop: space[6],
    paddingHorizontal: gutter,
    paddingBottom: space[10],
    gap: space[3],
  },
  intro: {
    gap: space[1],
    marginBottom: space[2],
  },
  card: {
    gap: space[2],
    padding: space[4],
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.card,
  },
  cardCorrect: {
    borderColor: colors.line,
  },
  cardWrong: {
    borderColor: colors.dangerBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[3],
  },
}));
