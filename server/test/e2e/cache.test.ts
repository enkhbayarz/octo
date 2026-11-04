import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { createCache } from '../../src/cache/cache.js';
import { createRedis, waitForRedis } from '../../src/cache/redis.js';
import { createLogger } from '../../src/lib/logger.js';
import { createMetrics } from '../../src/observability/metrics.js';
import { TEST_REDIS_URL } from '../helpers/env.js';

const logger = createLogger({ level: 'silent', service: 'test', release: 'test' });
let redis: Redis;
beforeAll(async () => {
  redis = createRedis(TEST_REDIS_URL, logger);
  await waitForRedis(redis, logger);
});
afterAll(() => redis.quit());

describe('read-through cache on real Redis', () => {
  test('loads once, then serves from Redis', async () => {
    const cache = createCache({ redis, logger, metrics: createMetrics() });
    const key = `test:${randomUUID()}`;
    let loads = 0;
    const load = async () => ({ n: ++loads });
    expect(await cache.getOrLoad('t', key, 60, load)).toEqual({ n: 1 });
    expect(await cache.getOrLoad('t', key, 60, load)).toEqual({ n: 1 });
    expect(loads).toBe(1);
  });

  test('single flight: 50 concurrent misses share one load', async () => {
    const cache = createCache({ redis, logger, metrics: createMetrics() });
    const key = `test:${randomUUID()}`;
    let loads = 0;
    const slowLoad = async () => {
      loads++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return 'value';
    };
    const values = await Promise.all(
      Array.from({ length: 50 }, () => cache.getOrLoad('t', key, 60, slowLoad)),
    );
    expect(new Set(values)).toEqual(new Set(['value']));
    expect(loads).toBe(1);
  });

  test('invalidate forces the next read to load fresh data', async () => {
    const cache = createCache({ redis, logger, metrics: createMetrics() });
    const key = `test:${randomUUID()}`;
    let version = 1;
    await cache.getOrLoad('t', key, 60, async () => version);
    version = 2;
    await cache.invalidate(key);
    expect(await cache.getOrLoad('t', key, 60, async () => version)).toBe(2);
  });

  test('a failed load is not cached and does not poison later reads', async () => {
    const cache = createCache({ redis, logger, metrics: createMetrics() });
    const key = `test:${randomUUID()}`;
    await expect(
      cache.getOrLoad('t', key, 60, () => Promise.reject(new Error('db down'))),
    ).rejects.toThrow('db down');
    expect(await cache.getOrLoad('t', key, 60, async () => 'recovered')).toBe('recovered');
  });

  test('invalidating nothing is a no-op; waiting on a ready client returns at once', async () => {
    const cache = createCache({ redis, logger, metrics: createMetrics() });
    await expect(cache.invalidate()).resolves.toBeUndefined();
    expect(await waitForRedis(redis, logger)).toBe(true);
  });

  test('logs a lost connection once and its recovery once, not every reconnect attempt', async () => {
    const warn = vi.fn();
    const info = vi.fn();
    const client = createRedis(TEST_REDIS_URL, {
      ...logger,
      warn,
      info,
    });
    try {
      await waitForRedis(client, logger);
      client.emit('error', new Error('connection reset'));
      client.emit('error', new Error('connection refused'));
      client.emit('ready');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith('redis connection restored');
    } finally {
      client.disconnect();
    }
  });

  test('startup carries on without Redis after a short wait', async () => {
    const down = createRedis('redis://127.0.0.1:1', logger);
    try {
      expect(await waitForRedis(down, logger, 100)).toBe(false);
    } finally {
      down.disconnect();
    }
  });

  test('with Redis down every call goes to the source, fast, and counts errors', async () => {
    const down = createRedis('redis://127.0.0.1:1', logger);
    const metrics = createMetrics();
    const cache = createCache({ redis: down, logger, metrics });
    try {
      const start = performance.now();
      expect(await cache.getOrLoad('t', 'k', 60, async () => 'from-db')).toBe('from-db');
      await cache.invalidate('k'); // logged, not thrown
      expect(performance.now() - start).toBeLessThan(500);
      const errors = (await metrics.cacheRequests.get()).values.find(
        (v) => v.labels.result === 'error',
      );
      expect(errors?.value).toBe(1);
    } finally {
      down.disconnect();
    }
  });
});
