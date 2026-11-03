import courseJson from './course.json';
import type { Course, PathItem } from './types';

export type * from './types';

/** Course content. Typed on assignment, so a malformed course.json fails `tsc`. */
export const course: Course = courseJson;

export function buildPath(source: Course): PathItem[] {
  return source.units.flatMap((unit, unitIndex): PathItem[] => [
    ...unit.lessons.map((lesson, indexInUnit): PathItem => ({
      kind: 'lesson',
      id: lesson.id,
      unitIndex,
      indexInUnit,
      unit,
      lesson,
    })),
    { kind: 'quiz', id: unit.quiz.id, unitIndex, unit, quiz: unit.quiz },
  ]);
}

export const pathItems = buildPath(course);

export const lessonCount = pathItems.filter((item) => item.kind === 'lesson').length;

export const quizCount = course.units.length;

export function findPathItem(id: string): PathItem | undefined {
  return pathItems.find((item) => item.id === id);
}
