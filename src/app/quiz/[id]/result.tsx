import { Redirect, useLocalSearchParams } from 'expo-router';

import { findPathItem } from '@/course';
import { decodeChoices } from '@/features/quiz/quiz-session';
import { QuizResultScreen } from '@/features/quiz/quiz-result-screen';

export default function QuizResultRoute() {
  const {
    id,
    choices = '',
    xp,
  } = useLocalSearchParams<{
    id: string;
    choices?: string;
    xp?: string;
  }>();
  const item = findPathItem(id);
  // One digit per question: the option the learner picked (e.g. "10212").
  const picked = item?.kind === 'quiz' ? decodeChoices(choices, item.quiz.questions) : null;
  if (item?.kind !== 'quiz' || !picked) return <Redirect href="/" />;

  return (
    <QuizResultScreen
      quiz={item.quiz}
      unitIndex={item.unitIndex}
      choices={picked}
      xpGained={Number(xp) || 0}
    />
  );
}
