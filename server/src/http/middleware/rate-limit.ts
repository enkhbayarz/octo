import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, Env, MiddlewareHandler } from 'hono';

import type { Redis } from '../../cache/redis.js';
import { AppError } from '../../lib/errors.js';
import type { Metrics } from '../../observability/metrics.js';
import type { AppEnv } from '../context.js';

/** Fixed window counter, atomic in one round trip: increment, start the window on the first hit. */
const HIT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;

type RateLimitOptions<E extends Env> = {
  redis: Redis;
  metrics: Metrics;
  name: string;
  limit: number;
  windowMs: number;
  /** Who is being limited: an IP or a learner id. */
  identify: (c: Context<E>) => string;
};

/**
 * Counters live in Redis so every replica shares them. If Redis is down the
 * limiter fails open: briefly losing rate limits beats rejecting every user.
 */
export function rateLimit<E extends AppEnv>(options: RateLimitOptions<E>): MiddlewareHandler<E> {
  const { redis, metrics, name, limit, windowMs, identify } = options;
  return async (c, next) => {
    const identity = identify(c);
    let count: number;
    let ttlMs: number;
    try {
      [count, ttlMs] = (await redis.eval(HIT, 1, `rl:${name}:${identity}`, windowMs)) as [
        number,
        number,
      ];
    } catch (err) {
      const { log } = (c as unknown as Context<AppEnv>).var;
      log.warn({ err, limiter: name }, 'rate limiter unavailable; allowing request');
      return next();
    }

    const resetSec = Math.max(1, Math.ceil(ttlMs / 1000));
    c.header('RateLimit-Limit', String(limit));
    c.header('RateLimit-Remaining', String(Math.max(0, limit - count)));
    c.header('RateLimit-Reset', String(resetSec));
    if (count > limit) {
      metrics.rateLimited.inc({ limiter: name });
      c.header('Retry-After', String(resetSec));
      throw new AppError('RATE_LIMITED', 'Too many requests, slow down');
    }
    await next();
  };
}

/**
 * The caller's IP. Behind Railway's proxy the socket address is the proxy, so
 * the proxy-set headers are used; they are ignored otherwise because any
 * client can send them.
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const real = c.req.header('x-real-ip');
    if (real) return real.trim();
    const forwarded = c.req.header('x-forwarded-for')?.split(',');
    // The proxy appends the address it saw, so the last entry is the one it vouches for.
    const last = forwarded?.at(-1)?.trim();
    if (last) return last;
  }
  return getConnInfo(c).remote.address ?? 'unknown';
}
