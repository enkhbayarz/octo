import { View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, radius, space } from '@/theme/tokens';

type AnswerFeedbackProps = {
  correct: boolean;
  praise: string;
  correctAnswer: string;
  continueLabel: string;
  bottomInset: number;
  onContinue: () => void;
};

/** Bottom sheet shown after "Check": result, the right answer if wrong, and one next step. */
export function AnswerFeedback({
  correct,
  praise,
  correctAnswer,
  continueLabel,
  bottomInset,
  onContinue,
}: AnswerFeedbackProps) {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  return (
    <Animated.View
      entering={SlideInDown.springify().dampingRatio(1)}
      style={[
        styles.sheet,
        {
          backgroundColor: correct ? colors.successLight : colors.dangerLight,
          paddingBottom: bottomInset + space[4],
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row} accessible accessibilityRole="alert">
        <View style={[styles.icon, { backgroundColor: correct ? colors.success : colors.danger }]}>
          <Icon name={correct ? 'check' : 'close'} color={colors.white} />
        </View>
        <View style={styles.text}>
          <AppText variant="heading" color={correct ? colors.successText : colors.dangerText}>
            {correct ? praise : t.quiz.wrong}
          </AppText>
          <AppText variant="label" color={correct ? colors.successText : colors.dangerText}>
            {correct ? t.quiz.correctBody : t.quiz.correctAnswerIs}
            {correct ? null : (
              <AppText variant="label" weight="bold" color={colors.dangerText}>
                {correctAnswer}
              </AppText>
            )}
          </AppText>
        </View>
      </View>
      <Button label={continueLabel} tone={correct ? 'success' : 'danger'} onPress={onContinue} />
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space[6],
    paddingHorizontal: gutter,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginBottom: space[4],
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: space[1],
  },
}));
