import { createRoute, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';

import type { Redis } from '../../cache/redis.js';
import type { Database } from '../../db/client.js';
import type { AppEnv } from '../../http/context.js';
import { createRouter } from '../../http/router.js';
import { dataOf, errors } from '../../http/schemas.js';
import { AppError } from '../../lib/errors.js';

const CheckSchema = z.object({
  status: z.enum(['ok', 'down']),
  latencyMs: z.number(),
  error: z.string().optional(),
});

const ReadinessSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.object({ database: CheckSchema, redis: CheckSchema }),
  })
  .openapi('Readiness');

const live = createRoute({
  method: 'get',
  path: '/live',
  tags: ['Health'],
  summary: 'Liveness: the process is up and its event loop is responding',
  responses: {
    200: {
      description: 'Alive',
      content: { 'application/json': { schema: dataOf(z.object({ status: z.literal('ok') })) } },
    },
  },
});

const ready = createRoute({
  method: 'get',
  path: '/ready',
  tags: ['Health'],
  summary: 'Readiness: safe to send traffic here',
  description:
    'Railway checks this before switching traffic to a new deploy. Fails (503) when Postgres is unreachable or the instance is shutting down. Redis being down only makes it "degraded": the API keeps working without its cache.',
  responses: {
    200: {
      description: 'Ready',
      content: { 'application/json': { schema: dataOf(ReadinessSchema) } },
    },
    503: errors[503],
  },
});

/** Runs a dependency check with a deadline; never throws. */
export async function check(
  probe: () => Promise<unknown>,
  timeoutMs: number,
): Promise<z.infer<typeof CheckSchema>> {
  const start = performance.now();
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs).unref(),
      ),
    ]);
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function healthRoutes(deps: {
  db: Database;
  redis: Redis;
  state: { shuttingDown: boolean };
}) {
  return createRouter<AppEnv>()
    .openapi(live, (c) => c.json({ data: { status: 'ok' as const } }, 200))
    .openapi(ready, async (c) => {
      if (deps.state.shuttingDown) throw new AppError('SERVICE_UNAVAILABLE', 'Shutting down');
      const [database, redis] = await Promise.all([
        check(() => deps.db.execute(sql`select 1`), 2_000),
        check(() => deps.redis.ping(), 1_000),
      ]);
      const checks = { database, redis };
      if (database.status === 'down')
        throw new AppError('SERVICE_UNAVAILABLE', 'Database unreachable', checks);
      return c.json(
        {
          data: { status: redis.status === 'ok' ? ('ok' as const) : ('degraded' as const), checks },
        },
        200,
      );
    });
}
