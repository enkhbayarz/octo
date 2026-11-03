import { Redirect, useLocalSearchParams } from 'expo-router';

import { findPathItem } from '@/course';
import { LessonCompleteScreen } from '@/features/lesson/lesson-complete-screen';

export default function LessonCompleteRoute() {
  const { id, xp, streakUp } = useLocalSearchParams<{
    id: string;
    xp?: string;
    streakUp?: string;
  }>();
  const item = findPathItem(id);

  if (item?.kind !== 'lesson') return <Redirect href="/" />;

  return (
    <LessonCompleteScreen
      lesson={item.lesson}
      xpGained={Number(xp) || 0}
      streakIncreased={streakUp === '1'}
    />
  );
}
