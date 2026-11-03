import { Redirect, useLocalSearchParams } from 'expo-router';

import { findPathItem } from '@/course';
import { decodeChoices } from '@/features/quiz/quiz-session';
import { QuizReviewScreen } from '@/features/quiz/quiz-review-screen';

export default function QuizReviewRoute() {
  const { id, choices = '' } = useLocalSearchParams<{ id: string; choices?: string }>();
  const item = findPathItem(id);
  const picked = item?.kind === 'quiz' ? decodeChoices(choices, item.quiz.questions) : null;
  if (item?.kind !== 'quiz' || !picked) return <Redirect href="/" />;

  return <QuizReviewScreen quiz={item.quiz} choices={picked} />;
}
