import { Redirect, useLocalSearchParams } from 'expo-router';

import { findPathItem } from '@/course';
import { QuizScreen } from '@/features/quiz/quiz-screen';
import { isUnlocked } from '@/progress/selectors';
import { useProgress } from '@/progress/store';

export default function QuizRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = findPathItem(id);
  const unlocked = useProgress((state) => isUnlocked(id, state));

  if (item?.kind !== 'quiz' || !unlocked) return <Redirect href="/" />;

  return <QuizScreen key={item.id} quiz={item.quiz} unitNumber={item.unitIndex + 1} />;
}
