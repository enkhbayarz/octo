import { describe, expect, test } from 'bun:test';

import { course, findPathItem, lessonCount, pathItems, resolveMediaUrl } from '.';

describe('course content', () => {
  test('meets the brief: 2+ units, 10 lessons, a 3–5 question quiz per unit', () => {
    expect(course.units.length).toBeGreaterThanOrEqual(2);
    expect(lessonCount).toBe(10);
    for (const unit of course.units) {
      expect(unit.lessons).toHaveLength(5);
      expect(unit.quiz.questions.length).toBeGreaterThanOrEqual(3);
      expect(unit.quiz.questions.length).toBeLessThanOrEqual(5);
    }
  });

  test('lessons are 10–15 minute videos, streamed as HLS from the media bucket', () => {
    for (const lesson of course.units.flatMap((unit) => unit.lessons)) {
      expect(lesson.durationSec).toBeGreaterThanOrEqual(600);
      expect(lesson.durationSec).toBeLessThanOrEqual(900);
      expect(lesson.videoUrl).toEndWith(`/media/videos/${lesson.id}/master.m3u8`);
    }
  });

  test('every question has 3 options and a valid answer', () => {
    for (const question of course.units.flatMap((unit) => unit.quiz.questions)) {
      expect(question.options).toHaveLength(3);
      expect(question.options[question.answerIndex]).toBeDefined();
    }
  });

  test('ids are unique across the path', () => {
    const ids = pathItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('path', () => {
  test('places each unit quiz after its 5 lessons', () => {
    expect(pathItems.map((item) => item.kind)).toEqual([
      ...Array<'lesson'>(5).fill('lesson'),
      'quiz',
      ...Array<'lesson'>(5).fill('lesson'),
      'quiz',
    ]);
  });

  test('finds items by id', () => {
    expect(findPathItem('u2-quiz')?.kind).toBe('quiz');
    expect(findPathItem('missing')).toBeUndefined();
  });
});

describe('resolveMediaUrl', () => {
  test('media paths play from the API; full URLs pass through', () => {
    expect(resolveMediaUrl('/media/videos/u1-l1/master.m3u8', 'https://api.test')).toBe(
      'https://api.test/media/videos/u1-l1/master.m3u8',
    );
    expect(resolveMediaUrl('https://cdn.test/a.mp4', 'https://api.test')).toBe(
      'https://cdn.test/a.mp4',
    );
    expect(resolveMediaUrl('/media/videos/u1-l1/master.m3u8', '')).toBe(
      '/media/videos/u1-l1/master.m3u8',
    );
  });
});
