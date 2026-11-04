import { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';

import type { AuthedEnv } from '../../http/context.js';
import { createRouter } from '../../http/router.js';
import { bearerSecurity, dataOf, errors } from '../../http/schemas.js';
import {
  IdempotencyHeaderSchema,
  LessonCompletionSchema,
  LessonParamsSchema,
  ProgressSchema,
  QuizAttemptBodySchema,
  QuizAttemptSchema,
  QuizParamsSchema,
  VideoProgressBodySchema,
  VideoProgressSchema,
} from '../progress/progress.schemas.js';
import type { ProgressService } from '../progress/progress.service.js';
import { ProfileSchema, UpdateProfileSchema } from './users.schemas.js';
import type { UsersService } from './users.service.js';

const json = <T>(schema: T) => ({ 'application/json': { schema } });
const base = { tags: ['Me'], security: bearerSecurity };
const authErrors = { 401: errors[401], 429: errors[429] } as const;

const getMe = createRoute({
  ...base,
  method: 'get',
  path: '/',
  summary: 'The signed-in learner (created on first call)',
  responses: {
    200: { description: 'Profile', content: json(dataOf(ProfileSchema)) },
    ...authErrors,
  },
});

const updateMe = createRoute({
  ...base,
  method: 'patch',
  path: '/',
  summary: 'Update name, time zone or onboarding answers',
  request: { body: { required: true, content: json(UpdateProfileSchema) } },
  responses: {
    200: { description: 'Updated profile', content: json(dataOf(ProfileSchema)) },
    400: errors[400],
    ...authErrors,
  },
});

const getProgress = createRoute({
  ...base,
  method: 'get',
  path: '/progress',
  summary: 'Completed lessons, quiz results, XP, streak and recent activity',
  responses: {
    200: { description: 'Progress', content: json(dataOf(ProgressSchema)) },
    ...authErrors,
  },
});

const completeLesson = createRoute({
  ...base,
  method: 'post',
  path: '/lessons/{lessonId}/complete',
  summary: 'Mark a lesson as watched',
  description: 'Safe to retry: completing an already completed lesson changes nothing.',
  request: { params: LessonParamsSchema },
  responses: {
    200: { description: 'Outcome', content: json(dataOf(LessonCompletionSchema)) },
    404: errors[404],
    409: errors[409],
    ...authErrors,
  },
});

const saveVideoProgress = createRoute({
  ...base,
  method: 'put',
  path: '/lessons/{lessonId}/video-progress',
  summary: 'Save where the lesson video was left',
  request: {
    params: LessonParamsSchema,
    body: { required: true, content: json(VideoProgressBodySchema) },
  },
  responses: {
    200: { description: 'Stored position', content: json(dataOf(VideoProgressSchema)) },
    400: errors[400],
    404: errors[404],
    ...authErrors,
  },
});

const submitQuizAttempt = createRoute({
  ...base,
  method: 'post',
  path: '/quizzes/{quizId}/attempts',
  summary: 'Submit answers to a quiz',
  description:
    'Graded on the server. Requires an `Idempotency-Key`: a retry with the same key returns the original result with `Idempotent-Replayed: true` instead of recording a second attempt.',
  request: {
    params: QuizParamsSchema,
    headers: IdempotencyHeaderSchema,
    body: { required: true, content: json(QuizAttemptBodySchema) },
  },
  responses: {
    201: { description: 'Graded attempt', content: json(dataOf(QuizAttemptSchema)) },
    400: errors[400],
    404: errors[404],
    409: errors[409],
    422: errors[422],
    ...authErrors,
  },
});

/** Everything under /v1/me. `guards` (auth, then per-learner rate limit) run before every route. */
export function meRoutes(
  { users, progress }: { users: UsersService; progress: ProgressService },
  guards: MiddlewareHandler<AuthedEnv>[],
) {
  const router = createRouter<AuthedEnv>();
  for (const guard of guards) router.use('*', guard);

  return router
    .openapi(getMe, async (c) => c.json({ data: await users.getProfile(c.var.user.id) }, 200))
    .openapi(updateMe, async (c) =>
      c.json({ data: await users.updateProfile(c.var.user.id, c.req.valid('json')) }, 200),
    )
    .openapi(getProgress, async (c) =>
      c.json({ data: await progress.getProgress(c.var.user.id) }, 200),
    )
    .openapi(completeLesson, async (c) => {
      const { lessonId } = c.req.valid('param');
      return c.json({ data: await progress.completeLesson(c.var.user.id, lessonId) }, 200);
    })
    .openapi(saveVideoProgress, async (c) => {
      const { lessonId } = c.req.valid('param');
      return c.json(
        { data: await progress.saveVideoProgress(c.var.user.id, lessonId, c.req.valid('json')) },
        200,
      );
    })
    .openapi(submitQuizAttempt, async (c) => {
      const { quizId } = c.req.valid('param');
      const { answers } = c.req.valid('json');
      const key = c.req.valid('header')['idempotency-key'];
      const { result, replayed } = await progress.submitQuizAttempt(
        c.var.user.id,
        quizId,
        answers,
        key,
      );
      if (replayed) c.header('Idempotent-Replayed', 'true');
      return c.json({ data: result }, 201);
    });
}
