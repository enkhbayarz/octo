import { describe, expect, test } from 'bun:test';

import { enqueue, type SyncOp } from './outbox';

const reduce = (ops: SyncOp[]) => ops.reduce(enqueue, [] as SyncOp[]);

describe('enqueue', () => {
  test('keeps order across kinds', () => {
    expect(
      reduce([
        { kind: 'lesson', lessonId: 'a' },
        { kind: 'quiz', quizId: 'q', answers: [1], key: 'k1' },
        { kind: 'lesson', lessonId: 'b' },
      ]).map((op) => op.kind),
    ).toEqual(['lesson', 'quiz', 'lesson']);
  });

  test('merges profile edits into one pending update', () => {
    expect(
      reduce([
        { kind: 'profile', displayName: 'A' },
        { kind: 'lesson', lessonId: 'a' },
        { kind: 'profile', timezone: 'Asia/Tokyo' },
        { kind: 'profile', displayName: 'B' },
      ]),
    ).toEqual([
      { kind: 'profile', displayName: 'B', timezone: 'Asia/Tokyo' },
      { kind: 'lesson', lessonId: 'a' },
    ]);
  });

  test('a lesson is queued once', () => {
    expect(
      reduce([
        { kind: 'lesson', lessonId: 'a' },
        { kind: 'lesson', lessonId: 'a' },
      ]),
    ).toHaveLength(1);
  });

  test('a video keeps its latest position and its furthest point', () => {
    expect(
      reduce([
        { kind: 'video', lessonId: 'a', positionSec: 8, furthestSec: 8 },
        { kind: 'video', lessonId: 'b', positionSec: 1, furthestSec: 1 },
        { kind: 'video', lessonId: 'a', positionSec: 2, furthestSec: 3 },
      ]),
    ).toEqual([
      { kind: 'video', lessonId: 'a', positionSec: 2, furthestSec: 8 },
      { kind: 'video', lessonId: 'b', positionSec: 1, furthestSec: 1 },
    ]);
  });

  test('every quiz attempt is kept', () => {
    expect(
      reduce([
        { kind: 'quiz', quizId: 'q', answers: [0], key: 'k1' },
        { kind: 'quiz', quizId: 'q', answers: [1], key: 'k2' },
      ]),
    ).toHaveLength(2);
  });

  test('an updated entry is a new object, so an in-flight send can tell it changed', () => {
    const first = reduce([{ kind: 'profile', displayName: 'A' }]);
    const second = enqueue(first, { kind: 'profile', displayName: 'B' });
    expect(second[0]).not.toBe(first[0]);
  });
});
