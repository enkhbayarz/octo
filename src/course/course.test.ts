import { describe, expect, test } from 'bun:test';

import { course, findPathItem, lessonCount, pathItems } from '.';

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
