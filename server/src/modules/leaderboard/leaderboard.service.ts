import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { and, gte, inArray, lt, sql } from 'drizzle-orm';

import { jitteredTtl } from '../../cache/cache.js';
import type { Redis } from '../../cache/redis.js';
import type { Database } from '../../db/client.js';
import { users, xpEvents } from '../../db/schema/index.js';
import { isoWeek, type Week } from '../../lib/dates.js';
import type { Logger } from '../../lib/logger.js';
import type { Metrics } from '../../observability/metrics.js';

/** Rebuilt from Postgres at least this often, which also heals any drift. */
const BOARD_TTL_SEC = 10 * 60;
const LOCK_TTL_MS = 5_000;

const keysFor = (week: string) => ({
  board: `lb:weekly:${week}`,
  /** Present only while the board is a complete copy of Postgres. */
  ready: `lb:weekly:${week}:ready`,
  staging: `lb:weekly:${week}:staging`,
  lock: `lock:lb:weekly:${week}`,
});

/** Only touch a complete board; a partial one (a single ZINCRBY on nothing) would rank wrongly. */
const INCREMENT_IF_READY = `
if redis.call('EXISTS', KEYS[1]) == 0 then return nil end
local score = redis.call('ZINCRBY', KEYS[2], ARGV[1], ARGV[2])
if redis.call('TTL', KEYS[2]) == -1 then redis.call('EXPIRE', KEYS[2], ARGV[3]) end
return score
`;

/** Release the lock only if we still own it (it may have expired and been taken). */
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string | null;
  xp: number;
  isMe: boolean;
};

type Ranked = { userId: string; xp: number }[];

export type LeaderboardService = ReturnType<typeof createLeaderboardService>;

/**
 * Weekly XP ranking.
 *
 * Postgres (`xp_events`) is the source of truth; a Redis sorted set is a
 * derived read model that answers "top N" and "my rank" in O(log n).
 * - Cold board: one instance rebuilds it under a Redis lock while others wait,
 *   so a burst of reads can't trigger a burst of rebuilds (cache stampede).
 * - New XP: added to the board after the database commit. If that fails, or
 *   races a rebuild, the board is off by a few points until its TTL rebuilds
 *   it (eventual consistency, bounded to 10 minutes).
 * - Redis down: the ranking is computed straight from Postgres.
 */
export function createLeaderboardService(deps: {
  db: Database;
  redis: Redis;
  logger: Logger;
  metrics: Metrics;
  clock: () => Date;
}) {
  const { db, redis, logger, metrics, clock } = deps;
  const rebuilding = new Map<string, Promise<boolean>>();

  async function totalsFromDatabase(week: Week): Promise<Ranked> {
    const rows = await db
      .select({ userId: xpEvents.userId, xp: sql<number>`sum(${xpEvents.amount})::int` })
      .from(xpEvents)
      .where(and(gte(xpEvents.createdAt, week.start), lt(xpEvents.createdAt, week.end)))
      .groupBy(xpEvents.userId);
    // Same order as Redis: score descending, then member descending.
    return rows.sort((a, b) => b.xp - a.xp || (a.userId < b.userId ? 1 : -1));
  }

  async function rebuild(week: Week): Promise<boolean> {
    const keys = keysFor(week.key);
    const token = randomUUID();
    if (!(await redis.set(keys.lock, token, 'PX', LOCK_TTL_MS, 'NX'))) {
      // Another instance is rebuilding; wait for it rather than rebuilding too.
      for (let i = 0; i < 20; i++) {
        await sleep(50);
        if (await redis.exists(keys.ready)) return true;
      }
      return false;
    }
    try {
      metrics.cacheLoads.inc({ cache: 'leaderboard' });
      const totals = await totalsFromDatabase(week);
      const ttl = jitteredTtl(BOARD_TTL_SEC);
      // Build aside, then swap in atomically: readers never see a half-built board.
      const tx = redis.multi().del(keys.staging);
      if (totals.length > 0) {
        tx.zadd(keys.staging, ...totals.flatMap((row) => [row.xp, row.userId]));
        tx.rename(keys.staging, keys.board);
        tx.expire(keys.board, ttl + 60);
      } else {
        tx.del(keys.board);
      }
      tx.set(keys.ready, '1', 'EX', ttl);
      await tx.exec();
      return true;
    } finally {
      await redis.eval(RELEASE_LOCK, 1, keys.lock, token).catch(() => {});
    }
  }

  async function ensureBoard(week: Week): Promise<boolean> {
    if (await redis.exists(keysFor(week.key).ready)) {
      metrics.cacheRequests.inc({ cache: 'leaderboard', result: 'hit' });
      return true;
    }
    metrics.cacheRequests.inc({ cache: 'leaderboard', result: 'miss' });
    let pending = rebuilding.get(week.key);
    if (!pending) {
      pending = rebuild(week).finally(() => rebuilding.delete(week.key));
      rebuilding.set(week.key, pending);
    }
    return pending;
  }

  async function fromRedis(week: Week, userId: string, limit: number) {
    if (!(await ensureBoard(week))) throw new Error('leaderboard not ready');
    const { board } = keysFor(week.key);
    const results = await redis
      .pipeline()
      .zrevrange(board, 0, limit - 1, 'WITHSCORES')
      .zrevrank(board, userId)
      .zscore(board, userId)
      .exec();
    // A command error (e.g. a corrupted key of the wrong type) sends the caller to Postgres.
    for (const [error] of results!) if (error) throw error;
    const flat = results![0]![1] as string[];
    const top: Ranked = [];
    for (let i = 0; i < flat.length; i += 2)
      top.push({ userId: flat[i]!, xp: Number(flat[i + 1]) });
    const rank = results![1]![1] as number | null;
    const score = results![2]![1] as string | null;
    return {
      top,
      me: rank === null || score === null ? null : { rank: rank + 1, xp: Number(score) },
    };
  }

  async function fromDatabase(week: Week, userId: string, limit: number) {
    const totals = await totalsFromDatabase(week);
    const index = totals.findIndex((row) => row.userId === userId);
    return {
      top: totals.slice(0, limit),
      me: index < 0 ? null : { rank: index + 1, xp: totals[index]!.xp },
    };
  }

  return {
    async weekly(userId: string, limit: number) {
      const week = isoWeek(clock());
      let ranking: Awaited<ReturnType<typeof fromRedis>>;
      try {
        ranking = await fromRedis(week, userId, limit);
      } catch (err) {
        metrics.cacheRequests.inc({ cache: 'leaderboard', result: 'error' });
        logger.warn({ err }, 'leaderboard cache unavailable; ranking from Postgres');
        ranking = await fromDatabase(week, userId, limit);
      }

      // Names for the whole page in one query, not one per entry (N+1).
      const ids = ranking.top.map((row) => row.userId);
      const names =
        ids.length === 0
          ? []
          : await db
              .select({ id: users.id, displayName: users.displayName })
              .from(users)
              .where(inArray(users.id, ids));
      const nameById = new Map(names.map((row) => [row.id, row.displayName]));

      return {
        week: { key: week.key, startsAt: week.start.toISOString(), endsAt: week.end.toISOString() },
        entries: ranking.top.map((row, index): LeaderboardEntry => ({
          rank: index + 1,
          userId: row.userId,
          displayName: nameById.get(row.userId) ?? null,
          xp: row.xp,
          isMe: row.userId === userId,
        })),
        me: ranking.me,
      };
    },

    /** Call after the XP is committed. Never throws: the board heals on its next rebuild. */
    async recordXp(userId: string, amount: number, at: Date): Promise<void> {
      const keys = keysFor(isoWeek(at).key);
      try {
        await redis.eval(
          INCREMENT_IF_READY,
          2,
          keys.ready,
          keys.board,
          amount,
          userId,
          BOARD_TTL_SEC + 60,
        );
      } catch (err) {
        logger.warn({ err, userId }, 'leaderboard update skipped; it catches up on rebuild');
      }
    },
  };
}
