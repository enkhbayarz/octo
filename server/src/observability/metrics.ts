import type pg from 'pg';
import client from 'prom-client';

export type Metrics = ReturnType<typeof createMetrics>;

/**
 * Prometheus metrics on a registry of their own (not the global one), so tests
 * can build many apps in one process. Default metrics include CPU, memory,
 * heap, GC and event-loop lag.
 */
export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });
  const registers = [registry];

  return {
    registry,
    httpDuration: new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency by route pattern',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers,
    }),
    httpInFlight: new client.Gauge({
      name: 'http_requests_in_flight',
      help: 'Requests currently being handled',
      registers,
    }),
    loadShed: new client.Counter({
      name: 'http_load_shed_total',
      help: 'Requests refused with 503 because the server was at capacity',
      registers,
    }),
    rateLimited: new client.Counter({
      name: 'http_rate_limited_total',
      help: 'Requests refused with 429',
      labelNames: ['limiter'] as const,
      registers,
    }),
    cacheRequests: new client.Counter({
      name: 'cache_requests_total',
      help: 'Cache lookups by result (hit, miss, error)',
      labelNames: ['cache', 'result'] as const,
      registers,
    }),
    cacheLoads: new client.Counter({
      name: 'cache_loads_total',
      help: 'Times a cached value was (re)built from Postgres; stays low thanks to single-flight',
      labelNames: ['cache'] as const,
      registers,
    }),

    /** Exposes pool usage; `waiting > 0` for long means the pool is too small or queries too slow. */
    trackPool(pool: pg.Pool) {
      new client.Gauge({
        name: 'db_pool_connections',
        help: 'Postgres pool connections by state',
        labelNames: ['state'] as const,
        registers,
        collect() {
          this.set({ state: 'total' }, pool.totalCount);
          this.set({ state: 'idle' }, pool.idleCount);
          this.set({ state: 'waiting' }, pool.waitingCount);
        },
      });
    },
  };
}
