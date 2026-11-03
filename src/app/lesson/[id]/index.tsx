import { Redirect, useLocalSearchParams } from 'expo-router';

import { findPathItem } from '@/course';
import { LessonScreen } from '@/features/lesson/lesson-screen';
import { isUnlocked } from '@/progress/selectors';
import { useProgress } from '@/progress/store';

export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = findPathItem(id);
  const unlocked = useProgress((state) => isUnlocked(id, state));

  if (item?.kind !== 'lesson' || !unlocked) return <Redirect href="/" />;

  return (
    <LessonScreen
      key={item.id}
      lesson={item.lesson}
      unitNumber={item.unitIndex + 1}
      lessonNumber={item.indexInUnit + 1}
      lessonsInUnit={item.unit.lessons.length}
    />
  );
}
