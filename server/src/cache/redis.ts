import { once } from 'node:events';

import { Redis } from 'ioredis';

import type { Logger } from '../lib/logger.js';
import { backoffDelay } from '../lib/retry.js';

export type { Redis };

/**
 * Redis is a cache and a rate-limit counter here, never the source of truth,
 * so the client is tuned to fail fast: a command errors immediately while the
 * connection is down (no offline queue) and gives up after 1s on a slow
 * server. Callers treat an error as a miss and fall back to Postgres. That
 * fail-fast behaviour is what a circuit breaker would give, without one.
 */
export function createRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url, {
    // Railway's private network is IPv6-only; 0 lets DNS return either family.
    family: 0,
    connectTimeout: 5_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Reconnect forever, with exponential backoff and jitter, capped at 5s.
    retryStrategy: (attempt) => backoffDelay(attempt, { baseMs: 100, maxMs: 5_000 }) + 50,
  });

  // Log state changes, not every failed reconnect, so an outage doesn't flood the logs.
  let healthy = true;
  redis.on('ready', () => {
    if (!healthy) logger.info('redis connection restored');
    healthy = true;
  });
  redis.on('error', (err) => {
    if (healthy) logger.warn({ err }, 'redis connection lost; serving from Postgres meanwhile');
    healthy = false;
  });
  return redis;
}

/** Waits briefly for the first connection. Not fatal: the app runs (slower) without Redis. */
export async function waitForRedis(
  redis: Redis,
  logger: Logger,
  timeoutMs = 5_000,
): Promise<boolean> {
  if (redis.status === 'ready') return true;
  try {
    await once(redis, 'ready', { signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    logger.warn('redis not reachable at startup; continuing without cache');
    return false;
  }
}
