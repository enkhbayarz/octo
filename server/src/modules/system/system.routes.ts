import { timingSafeEqual } from 'node:crypto';

import { Hono, type MiddlewareHandler } from 'hono';
import type pg from 'pg';

import type { Config } from '../../config/env.js';
import type { AppEnv } from '../../http/context.js';
import { AppError } from '../../lib/errors.js';
import type { Metrics } from '../../observability/metrics.js';
import type { RuntimeStats } from '../../observability/runtime-stats.js';

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Operational endpoints. With METRICS_TOKEN set they need it as a Bearer
 * token; without it they are open in development and hidden in production.
 */
function requireMetricsToken(config: Config): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = config.METRICS_TOKEN;
    if (!token) {
      if (config.NODE_ENV === 'production') throw new AppError('NOT_FOUND', 'Not found');
      return next();
    }
    const sent = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
    if (!sameSecret(sent, token)) throw new AppError('UNAUTHORIZED', 'Metrics token required');
    await next();
  };
}

export function systemRoutes(deps: {
  config: Config;
  metrics: Metrics;
  runtimeStats: RuntimeStats;
  pool: pg.Pool;
}) {
  const { config, metrics, runtimeStats, pool } = deps;
  const guard = requireMetricsToken(config);

  return new Hono<AppEnv>()
    .get('/', (c) =>
      c.json({
        data: {
          name: config.SERVICE_NAME,
          release: config.RELEASE,
          docs: '/docs',
          openapi: '/openapi.json',
        },
      }),
    )
    .get('/metrics', guard, async (c) => {
      c.header('Content-Type', metrics.registry.contentType);
      return c.body(await metrics.registry.metrics());
    })
    .get('/internal/stats', guard, async (c) => {
      const inFlight = (await metrics.httpInFlight.get()).values[0]!.value;
      return c.json({
        data: {
          release: config.RELEASE,
          ...runtimeStats.snapshot(),
          http: { inFlight, maxInFlight: config.MAX_IN_FLIGHT },
          databasePool: {
            max: config.DATABASE_POOL_MAX,
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount,
          },
        },
      });
    });
}
