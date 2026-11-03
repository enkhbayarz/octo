import { describe, expect, test } from 'bun:test';

import { course } from '@/course';

import {
  decodeChoices,
  encodeChoices,
  hasUnsavedAnswers,
  initialQuizSession,
  quizSessionReducer,
  scoreChoices,
} from './quiz-session';

const questions = course.units[0]!.quiz.questions;

const play = (...actions: Parameters<typeof quizSessionReducer>[1][]) =>
  actions.reduce(quizSessionReducer, initialQuizSession);

describe('quiz session', () => {
  test('records each checked choice, then advances', () => {
    const state = play(
      { type: 'select', option: 1 },
      { type: 'check' },
      { type: 'next' },
      { type: 'select', option: 0 },
      { type: 'check' },
    );
    expect(state.choices).toEqual([1, 0]);
    expect(state.index).toBe(1);
    expect(state.checked).toBe(true);
  });

  test('cannot check without a selection', () => {
    expect(play({ type: 'check' })).toEqual(initialQuizSession);
  });

  test('locks the answer once checked', () => {
    const state = play(
      { type: 'select', option: 2 },
      { type: 'check' },
      { type: 'select', option: 0 },
      { type: 'check' },
    );
    expect(state.selected).toBe(2);
    expect(state.choices).toEqual([2]);
  });

  test('cannot skip a question before checking it', () => {
    expect(play({ type: 'select', option: 1 }, { type: 'next' }).index).toBe(0);
  });

  test('knows when leaving would lose answers', () => {
    expect(hasUnsavedAnswers(initialQuizSession)).toBe(false);
    expect(hasUnsavedAnswers(play({ type: 'select', option: 0 }))).toBe(true);
  });
});

describe('choices', () => {
  test('are scored against the answer key', () => {
    // Unit 1 answers: 1, 0, 1, 2, 0
    expect(scoreChoices(questions, [1, 0, 0, 2, 1])).toEqual([true, true, false, true, false]);
  });

  test('round-trip through the route param', () => {
    expect(decodeChoices(encodeChoices([1, 0, 2, 2, 0]), questions)).toEqual([1, 0, 2, 2, 0]);
  });

  test('reject tampered params', () => {
    expect(decodeChoices('1020', questions)).toBeNull(); // too short
    expect(decodeChoices('10203', questions)).toBeNull(); // option 3 doesn't exist
    expect(decodeChoices('1a202', questions)).toBeNull();
  });
});
