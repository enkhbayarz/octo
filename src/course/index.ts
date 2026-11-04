import { apiUrl } from '@/lib/config';

import courseJson from './course.json';
import type { Course, PathItem } from './types';

export type * from './types';

/**
 * Lesson videos are stored as paths on the API ("/media/videos/…/master.m3u8"),
 * served from the media bucket through the API and its CDN. Full URLs pass through.
 */
export function resolveMediaUrl(url: string, base: string = apiUrl): string {
  return url.startsWith('/') && base ? `${base}${url}` : url;
}

/** Typed on assignment, so a malformed course.json fails `tsc`. */
const source: Course = courseJson;

/** Course content, with video paths resolved to playable URLs. */
export const course: Course = {
  ...source,
  units: source.units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((lesson) => ({
      ...lesson,
      videoUrl: resolveMediaUrl(lesson.videoUrl),
    })),
  })),
};

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
