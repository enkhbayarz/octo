import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { quizAttempts } from '../../src/db/schema/index.js';
import { startTestApp, type TestApp } from '../helpers/harness.js';
import {
  completeLessons,
  correctAnswers,
  submitQuiz,
  unitLessons,
  wrongAnswers,
} from '../helpers/learning.js';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.close());

async function learnerReadyForQuiz() {
  const learner = await app.newLearner();
  await completeLessons(app, learner.token, unitLessons(0));
  return learner;
}

describe('POST /v1/me/quizzes/:quizId/attempts', () => {
  test('needs an Idempotency-Key', async () => {
    const { token } = await learnerReadyForQuiz();
    const { status, body } = await app.call('/v1/me/quizzes/u1-quiz/attempts', {
      method: 'POST',
      token,
      json: { answers: correctAnswers(0) },
    });
    expect(status).toBe(400);
    expect(body.error.details[0]).toMatchObject({ in: 'header', path: 'idempotency-key' });
  });

  test('is locked until every lesson in the unit is done', async () => {
    const { token } = await app.newLearner();
    const { status, body } = await submitQuiz(app, token, 'u1-quiz', correctAnswers(0));
    expect(status).toBe(409);
    expect(body.error.code).toBe('ITEM_LOCKED');
  });

  test('checks the answers fit the quiz', async () => {
    const { token } = await learnerReadyForQuiz();
    const tooFew = await submitQuiz(app, token, 'u1-quiz', [1, 1]);
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.error.details).toEqual([
      { path: 'answers', message: 'Expected 5 answers, got 2' },
    ]);

    const tooMany = await submitQuiz(app, token, 'u1-quiz', [1, 1, 1, 1, 1, 1]);
    expect(tooMany.body.error.details).toEqual([
      { path: 'answers', message: 'Expected 5 answers, got 6' },
    ]);

    const outOfRange = await submitQuiz(app, token, 'u1-quiz', [1, 1, 7, 1, 1]);
    expect(outOfRange.body.error.details).toEqual([
      { path: 'answers.2', message: 'Choose an option between 0 and 2' },
    ]);
  });

  test('grades on the server: a failed attempt earns no XP but still counts for the streak', async () => {
    const { token } = await learnerReadyForQuiz();
    const { status, body } = await submitQuiz(app, token, 'u1-quiz', wrongAnswers(0));
    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      quizId: 'u1-quiz',
      correct: 0,
      total: 5,
      passed: false,
      xpGained: 0,
      result: { best: 0, passed: false, attempts: 1 },
      totals: { xp: 50, streak: 1 },
    });
  });

  test('the first pass earns 20 XP and unlocks the next unit; later passes earn nothing', async () => {
    const { token } = await learnerReadyForQuiz();
    await submitQuiz(app, token, 'u1-quiz', wrongAnswers(0));

    const pass = await submitQuiz(app, token, 'u1-quiz', correctAnswers(0));
    expect(pass.body.data).toMatchObject({
      correct: 5,
      passed: true,
      xpGained: 20,
      result: { best: 5, passed: true, attempts: 2 },
      totals: { xp: 70 },
    });
    expect(
      (await app.call('/v1/me/lessons/u2-l1/complete', { method: 'POST', token })).status,
    ).toBe(200);

    const again = await submitQuiz(app, token, 'u1-quiz', correctAnswers(0));
    expect(again.body.data).toMatchObject({ passed: true, xpGained: 0, result: { attempts: 3 } });

    const { body } = await app.call('/v1/me/progress', { token });
    expect(body.data.quizResults['u1-quiz']).toEqual({
      best: 5,
      total: 5,
      passed: true,
      attempts: 3,
    });
  });
});

describe('idempotency', () => {
  test('a retry with the same key replays the first result instead of recording twice', async () => {
    const { token, id } = await learnerReadyForQuiz();
    const key = randomUUID();
    const first = await submitQuiz(app, token, 'u1-quiz', correctAnswers(0), key);
    const retry = await submitQuiz(app, token, 'u1-quiz', correctAnswers(0), key);

    expect(retry.status).toBe(201);
    expect(retry.headers.get('idempotent-replayed')).toBe('true');
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    expect(retry.body).toEqual(first.body);
    expect(
      await app.deps.db.select().from(quizAttempts).where(eq(quizAttempts.userId, id)),
    ).toHaveLength(1);
    expect((await app.call('/v1/me', { token })).body.data.xp).toBe(70);
  });

  test('race: 5 simultaneous retries of one attempt record it once', async () => {
    const { token, id } = await learnerReadyForQuiz();
    const key = randomUUID();
    const replies = await Promise.all(
      Array.from({ length: 5 }, () => submitQuiz(app, token, 'u1-quiz', correctAnswers(0), key)),
    );
    expect(replies.map((reply) => reply.status)).toEqual(Array(5).fill(201));
    expect(new Set(replies.map((reply) => reply.body.data.attemptId)).size).toBe(1);
    expect(
      replies.filter((reply) => reply.headers.get('idempotent-replayed') === 'true'),
    ).toHaveLength(4);
    expect(
      await app.deps.db.select().from(quizAttempts).where(eq(quizAttempts.userId, id)),
    ).toHaveLength(1);
  });

  test('reusing a key for different answers is refused', async () => {
    const { token } = await learnerReadyForQuiz();
    const key = randomUUID();
    await submitQuiz(app, token, 'u1-quiz', wrongAnswers(0), key);
    const { status, body } = await submitQuiz(app, token, 'u1-quiz', correctAnswers(0), key);
    expect(status).toBe(422);
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  test("keys are per learner: two learners can't collide", async () => {
    const a = await learnerReadyForQuiz();
    const b = await learnerReadyForQuiz();
    const key = randomUUID();
    const first = await submitQuiz(app, a.token, 'u1-quiz', correctAnswers(0), key);
    const second = await submitQuiz(app, b.token, 'u1-quiz', wrongAnswers(0), key);
    expect(second.status).toBe(201);
    expect(second.body.data.attemptId).not.toBe(first.body.data.attemptId);
  });
});
