import { createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';

import type { AuthedEnv } from '../../http/context.js';
import { createRouter } from '../../http/router.js';
import { bearerSecurity, dataOf, errors } from '../../http/schemas.js';
import type { LeaderboardService } from './leaderboard.service.js';

const LeaderboardSchema = z
  .object({
    week: z.object({
      key: z.string().openapi({ example: '2026-W45' }),
      startsAt: z.string(),
      endsAt: z.string(),
    }),
    entries: z.array(
      z.object({
        rank: z.number().int(),
        userId: z.string(),
        displayName: z.string().nullable(),
        xp: z.number().int(),
        isMe: z.boolean(),
      }),
    ),
    /** The caller's place, even when outside the top `limit`. Null before any XP this week. */
    me: z.object({ rank: z.number().int(), xp: z.number().int() }).nullable(),
  })
  .openapi('WeeklyLeaderboard');

const weekly = createRoute({
  method: 'get',
  path: '/weekly',
  tags: ['Leaderboard'],
  security: bearerSecurity,
  summary: 'XP earned this week (Monday 00:00 UTC onwards), highest first',
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20).openapi({ example: 20 }),
    }),
  },
  responses: {
    200: {
      description: 'Ranking',
      content: { 'application/json': { schema: dataOf(LeaderboardSchema) } },
    },
    400: errors[400],
    401: errors[401],
  },
});

export function leaderboardRoutes(
  leaderboard: LeaderboardService,
  guards: MiddlewareHandler<AuthedEnv>[],
) {
  const router = createRouter<AuthedEnv>();
  for (const guard of guards) router.use('*', guard);
  return router.openapi(weekly, async (c) => {
    const { limit } = c.req.valid('query');
    return c.json({ data: await leaderboard.weekly(c.var.user.id, limit) }, 200);
  });
}
