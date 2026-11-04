import { randomUUID } from 'node:crypto';

import courseJson from '../../src/db/seed-data/course.json' with { type: 'json' };
import type { TestApp } from './harness.js';

export const unitLessons = (unit: number) =>
  courseJson.units[unit]!.lessons.map((lesson) => lesson.id);
export const correctAnswers = (unit: number) =>
  courseJson.units[unit]!.quiz.questions.map((q) => q.answerIndex);
export const wrongAnswers = (unit: number) =>
  courseJson.units[unit]!.quiz.questions.map((q) => (q.answerIndex + 1) % q.options.length);

export async function completeLessons(app: TestApp, token: string, ids: string[]) {
  for (const id of ids) {
    const reply = await app.call(`/v1/me/lessons/${id}/complete`, { method: 'POST', token });
    if (reply.status !== 200)
      throw new Error(`completing ${id}: ${reply.status} ${JSON.stringify(reply.body)}`);
  }
}

export function submitQuiz(
  app: TestApp,
  token: string,
  quizId: string,
  answers: number[],
  key = randomUUID(),
) {
  return app.call(`/v1/me/quizzes/${quizId}/attempts`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': key },
    json: { answers },
  });
}
