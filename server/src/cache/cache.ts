import type { Logger } from '../lib/logger.js';
import type { Metrics } from '../observability/metrics.js';
import type { Redis } from './redis.js';

/** ±10% so keys written together don't all expire, and get rebuilt, together. */
export function jitteredTtl(ttlSec: number, random = Math.random): number {
  return Math.max(1, Math.round(ttlSec * (0.9 + random() * 0.2)));
}

export type Cache = ReturnType<typeof createCache>;

/**
 * Read-through cache on Redis.
 *
 * - Stampede protection: concurrent misses for one key in this process share
 *   a single load ("single flight"), so a cold key costs one query, not one
 *   per waiting request. Across replicas the worst case is one load each,
 *   which is fine at this scale.
 * - Redis down or slow: treated as a miss; the value is loaded from Postgres.
 * - Invalidation: callers delete keys when the underlying data changes; the
 *   TTL bounds how stale a value can get if a delete is ever missed.
 */
export function createCache({
  redis,
  logger,
  metrics,
}: {
  redis: Redis;
  logger: Logger;
  metrics: Metrics;
}) {
  const inflight = new Map<string, Promise<unknown>>();

  async function read(name: string, key: string): Promise<string | null> {
    try {
      const value = await redis.get(key);
      metrics.cacheRequests.inc({ cache: name, result: value === null ? 'miss' : 'hit' });
      return value;
    } catch (err) {
      metrics.cacheRequests.inc({ cache: name, result: 'error' });
      logger.debug({ err, key }, 'cache read failed');
      return null;
    }
  }

  async function write(key: string, value: unknown, ttlSec: number) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', jitteredTtl(ttlSec));
    } catch (err) {
      logger.debug({ err, key }, 'cache write failed');
    }
  }

  return {
    async getOrLoad<T>(
      name: string,
      key: string,
      ttlSec: number,
      load: () => Promise<T>,
    ): Promise<T> {
      const cached = await read(name, key);
      if (cached !== null) return JSON.parse(cached) as T;

      let pending = inflight.get(key) as Promise<T> | undefined;
      if (!pending) {
        pending = (async () => {
          metrics.cacheLoads.inc({ cache: name });
          const value = await load();
          // "Not found" isn't cached: random ids must not be able to fill Redis.
          if (value !== null) await write(key, value, ttlSec);
          return value;
        })().finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      return pending;
    },

    async invalidate(...keys: string[]): Promise<void> {
      if (keys.length === 0) return;
      try {
        await redis.del(...keys);
      } catch (err) {
        logger.warn({ err, keys }, 'cache invalidation failed; entries expire with their TTL');
      }
    },
  };
}
