import { randomUUID } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';

import type { Metrics } from '../../observability/metrics.js';
import type { AppEnv } from '../context.js';

/**
 * Backpressure: past `maxInFlight` concurrent requests, refuse new ones with
 * 503 + Retry-After right away. Queueing them instead would make every request
 * slow (they'd wait on the 10-connection DB pool) and eventually exhaust memory.
 *
 * It runs first and answers without logging or the error handler: under a
 * flood, rejecting must cost almost nothing, or the rejections themselves eat
 * the CPU the accepted requests need. Rejections are counted in
 * `http_load_shed_total`. Health checks are exempt so a busy instance isn't
 * mistaken for a dead one.
 */
export function loadShed(maxInFlight: number, metrics: Metrics): MiddlewareHandler<AppEnv> {
  let inFlight = 0;
  return async (c, next) => {
    if (c.req.path.startsWith('/health')) return next();
    if (inFlight >= maxInFlight) {
      metrics.loadShed.inc();
      const requestId = randomUUID();
      return c.json(
        {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'The server is busy, please retry shortly',
            requestId,
          },
        },
        503,
        { 'Retry-After': '1', 'X-Request-Id': requestId },
      );
    }
    inFlight++;
    try {
      await next();
    } finally {
      inFlight--;
    }
  };
}
