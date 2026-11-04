import { trace } from '@opentelemetry/api';
import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';

import type { Metrics } from '../../observability/metrics.js';
import type { AppEnv } from '../context.js';

const QUIET = /^\/(health|metrics|internal)\b/;

/**
 * One structured log line and one histogram sample per request, labelled with
 * the route pattern ("/v1/courses/:courseId"), never the raw path, so metrics
 * keep a bounded number of series.
 */
export function observe(
  metrics: Metrics,
  state: { shuttingDown: boolean },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    metrics.httpInFlight.inc();
    try {
      await next();
    } finally {
      metrics.httpInFlight.dec();
      const durationMs = performance.now() - start;
      // Only middleware patterns end in "*"; ending on one means no route handled the request.
      const matched = routePath(c, -1);
      const route = matched.endsWith('*') ? 'unmatched' : matched;
      const status = c.res.status;

      metrics.httpDuration.observe(
        { method: c.req.method, route, status_code: String(status) },
        durationMs / 1000,
      );
      // Names the tracing span after the route when OpenTelemetry is on; a no-op otherwise.
      trace.getActiveSpan()?.updateName(`${c.req.method} ${route}`);
      // While draining for shutdown, tell keep-alive clients to reconnect elsewhere.
      if (state.shuttingDown) c.header('Connection', 'close');

      const fields = {
        method: c.req.method,
        path: c.req.path,
        route,
        status,
        durationMs: Math.round(durationMs),
      };
      if (status >= 500 && status !== 503) c.var.log.error(fields, 'request completed');
      else if (status === 503) c.var.log.warn(fields, 'request completed');
      else if (QUIET.test(c.req.path)) c.var.log.debug(fields, 'request completed');
      else c.var.log.info(fields, 'request completed');
    }
  };
}
