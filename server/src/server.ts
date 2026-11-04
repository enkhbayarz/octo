import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { serve } from '@hono/node-server';

import { type AppDeps, createApp } from './app.js';
import { createRedis, waitForRedis } from './cache/redis.js';
import type { Config } from './config/env.js';
import { createDb, createPool, waitForDatabase } from './db/client.js';
import { createClerkVerifier } from './http/middleware/auth.js';
import { startCleanupJob } from './jobs/cleanup.js';
import type { Logger } from './lib/logger.js';
import { createMetrics } from './observability/metrics.js';
import { createRuntimeStats } from './observability/runtime-stats.js';

/** Connects to Postgres and Redis and assembles the app's dependencies. */
export async function createDeps(
  config: Config,
  logger: Logger,
  overrides: Partial<Pick<AppDeps, 'clock' | 'verifyToken'>> = {},
): Promise<AppDeps> {
  const pool = createPool(
    {
      url: config.DATABASE_URL,
      max: config.DATABASE_POOL_MAX,
      statementTimeoutMs: config.DATABASE_STATEMENT_TIMEOUT_MS,
      applicationName: config.SERVICE_NAME,
    },
    logger,
  );
  const db = createDb(pool);
  await waitForDatabase(db, logger);

  const redis = createRedis(config.REDIS_URL, logger);
  await waitForRedis(redis, logger);

  const metrics = createMetrics();
  metrics.trackPool(pool);

  return {
    config,
    logger,
    pool,
    db,
    redis,
    metrics,
    runtimeStats: createRuntimeStats(),
    verifyToken: overrides.verifyToken ?? createClerkVerifier(config),
    clock: overrides.clock ?? (() => new Date()),
    state: { shuttingDown: false },
  };
}

export type RunningServer = {
  url: string;
  server: Server;
  shutdown: (reason: string) => Promise<void>;
};

export async function startServer(deps: AppDeps): Promise<RunningServer> {
  const { config, logger, pool, redis, state } = deps;
  const app = createApp(deps);
  const cleanup = startCleanupJob({ db: deps.db, logger });

  const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }) as Server;
  // Longer than any proxy's idle timeout, so the proxy (not Node) closes idle keep-alive sockets.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port, address } = server.address() as AddressInfo;
  const host = address.includes(':') ? `[${address}]` : address;

  let stopping: Promise<void> | undefined;
  /**
   * Graceful shutdown, in order: fail readiness and stop accepting
   * connections; let in-flight requests finish; close idle keep-alive
   * sockets; then close the pool and Redis. Callers add a hard deadline.
   */
  function shutdown(reason: string) {
    stopping ??= (async () => {
      logger.info({ reason }, 'shutting down: draining in-flight requests');
      state.shuttingDown = true;
      cleanup.stop();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
      });
      await Promise.allSettled([pool.end(), redis.quit()]);
      deps.runtimeStats.stop();
      logger.info('shutdown complete');
    })();
    return stopping;
  }

  return { url: `http://${host}:${port}`, server, shutdown };
}
