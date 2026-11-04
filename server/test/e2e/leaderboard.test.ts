import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { startTestApp, type TestApp } from '../helpers/harness.js';
import { completeLessons, correctAnswers, submitQuiz, unitLessons } from '../helpers/learning.js';

// A week of its own (2030-W02), so other test files' XP doesn't show up here.
const clock = () => new Date('2030-01-09T12:00:00Z');
const WEEK = '2030-W02';

let app: TestApp;
const learners: Record<'ana' | 'bat' | 'cece', { token: string; id: string }> = {} as never;

beforeAll(async () => {
  app = await startTestApp({}, { clock });
  for (const name of ['ana', 'bat', 'cece'] as const) {
    const learner = await app.newLearner();
    await app.call('/v1/me', {
      method: 'PATCH',
      token: learner.token,
      json: { displayName: name },
    });
    learners[name] = learner;
  }
  // bat 70 XP (5 lessons + quiz pass), ana 30, cece 10.
  await completeLessons(app, learners.bat.token, unitLessons(0));
  await submitQuiz(app, learners.bat.token, 'u1-quiz', correctAnswers(0));
  await completeLessons(app, learners.ana.token, unitLessons(0).slice(0, 3));
  await completeLessons(app, learners.cece.token, unitLessons(0).slice(0, 1));
});
afterAll(() => app.close());

const weekly = (token: string, query = '') => app.call(`/v1/leaderboard/weekly${query}`, { token });

describe('GET /v1/leaderboard/weekly', () => {
  test('ranks learners by XP earned this week, with names', async () => {
    const { status, body } = await weekly(learners.ana.token);
    expect(status).toBe(200);
    expect(body.data.week).toEqual({
      key: WEEK,
      startsAt: '2030-01-07T00:00:00.000Z',
      endsAt: '2030-01-14T00:00:00.000Z',
    });
    expect(
      body.data.entries.map((entry: any) => [entry.rank, entry.displayName, entry.xp, entry.isMe]),
    ).toEqual([
      [1, 'bat', 70, false],
      [2, 'ana', 30, true],
      [3, 'cece', 10, false],
    ]);
    expect(body.data.me).toEqual({ rank: 2, xp: 30 });
  });

  test("shows the caller's rank even outside the top N", async () => {
    const { body } = await weekly(learners.cece.token, '?limit=1');
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.me).toEqual({ rank: 3, xp: 10 });
  });

  test('a learner with no XP this week has no rank', async () => {
    const newcomer = await app.newLearner();
    expect((await weekly(newcomer.token)).body.data.me).toBeNull();
  });

  test('is served from a Redis sorted set that new XP updates in place', async () => {
    await weekly(learners.ana.token);
    expect(await app.deps.redis.exists(`lb:weekly:${WEEK}:ready`)).toBe(1);
    expect(await app.deps.redis.zscore(`lb:weekly:${WEEK}`, learners.cece.id)).toBe('10');

    await completeLessons(app, learners.cece.token, ['u1-l2']);
    expect(await app.deps.redis.zscore(`lb:weekly:${WEEK}`, learners.cece.id)).toBe('20');
    expect((await weekly(learners.cece.token)).body.data.me).toEqual({ rank: 3, xp: 20 });
  });

  test('rebuilds from Postgres when the cached board expires (and heals any drift)', async () => {
    // Simulate drift, e.g. a missed update: corrupt the cached score, then expire the board.
    await app.deps.redis.zadd(`lb:weekly:${WEEK}`, 999, learners.cece.id);
    await app.deps.redis.del(`lb:weekly:${WEEK}:ready`);
    const { body } = await weekly(learners.cece.token);
    expect(body.data.me).toEqual({ rank: 3, xp: 20 });
  });

  test('a burst of reads on a cold board triggers one rebuild, not one per request', async () => {
    await app.deps.redis.del(`lb:weekly:${WEEK}:ready`, `lb:weekly:${WEEK}`);
    const rebuilds = async () =>
      (await app.deps.metrics.cacheLoads.get()).values.find((v) => v.labels.cache === 'leaderboard')
        ?.value ?? 0;
    const before = await rebuilds();
    const replies = await Promise.all(Array.from({ length: 20 }, () => weekly(learners.bat.token)));
    expect(replies.every((reply) => reply.body.data.entries[0].displayName === 'bat')).toBe(true);
    expect((await rebuilds()) - before).toBe(1);
  });

  test('waits for another replica that is already rebuilding instead of rebuilding too', async () => {
    const keys = {
      board: `lb:weekly:${WEEK}`,
      ready: `lb:weekly:${WEEK}:ready`,
      lock: `lock:lb:weekly:${WEEK}`,
    };
    await app.deps.redis.del(keys.ready);
    await app.deps.redis.set(keys.lock, 'other-replica', 'PX', 5_000);
    // The "other replica" finishes 120ms later.
    setTimeout(() => void app.deps.redis.set(keys.ready, '1', 'EX', 60), 120);
    try {
      const { body } = await weekly(learners.ana.token);
      expect(body.data.entries[0].displayName).toBe('bat');
      expect(await app.deps.redis.get(keys.lock)).toBe('other-replica'); // never touched it
    } finally {
      await app.deps.redis.del(keys.lock);
    }
  });

  test('if the other replica never finishes, answers from Postgres', async () => {
    const keys = { ready: `lb:weekly:${WEEK}:ready`, lock: `lock:lb:weekly:${WEEK}` };
    await app.deps.redis.del(keys.ready);
    await app.deps.redis.set(keys.lock, 'stuck-replica', 'PX', 5_000);
    try {
      const { status, body } = await weekly(learners.ana.token);
      expect(status).toBe(200);
      expect(body.data.me).toEqual({ rank: 2, xp: 30 });
    } finally {
      await app.deps.redis.del(keys.lock);
    }
  });

  test('a week with no XP yet is an empty board', async () => {
    const quietWeek = await startTestApp({}, { clock: () => new Date('2031-06-04T12:00:00Z') });
    try {
      const { body } = await quietWeek.call('/v1/leaderboard/weekly', {
        token: learners.ana.token,
      });
      expect(body.data).toMatchObject({ week: { key: '2031-W23' }, entries: [], me: null });
      expect(await quietWeek.deps.redis.exists('lb:weekly:2031-W23:ready')).toBe(1);
    } finally {
      await quietWeek.close();
    }
  });

  test('a corrupted cache key never breaks the endpoint', async () => {
    await app.deps.redis.del(`lb:weekly:${WEEK}`);
    await app.deps.redis.set(`lb:weekly:${WEEK}`, 'not a sorted set');
    await app.deps.redis.set(`lb:weekly:${WEEK}:ready`, '1', 'EX', 60);
    try {
      const { status, body } = await weekly(learners.ana.token);
      expect(status).toBe(200);
      expect(body.data.me).toEqual({ rank: 2, xp: 30 });
    } finally {
      await app.deps.redis.del(`lb:weekly:${WEEK}`, `lb:weekly:${WEEK}:ready`);
    }
  });

  test('falls back to Postgres when Redis is down', async () => {
    const degraded = await startTestApp({ REDIS_URL: 'redis://127.0.0.1:1' }, { clock });
    try {
      const { status, body } = await degraded.call('/v1/leaderboard/weekly', {
        token: learners.ana.token,
      });
      expect(status).toBe(200);
      expect(body.data.entries.map((entry: any) => entry.displayName)).toEqual([
        'bat',
        'ana',
        'cece',
      ]);
      expect(body.data.me).toEqual({ rank: 2, xp: 30 });
      const newcomer = await degraded.newLearner();
      expect(
        (await degraded.call('/v1/leaderboard/weekly', { token: newcomer.token })).body.data.me,
      ).toBeNull();
    } finally {
      await degraded.close();
    }
  });

  test('validates the limit', async () => {
    expect((await weekly(learners.ana.token, '?limit=0')).status).toBe(400);
    expect((await weekly(learners.ana.token, '?limit=500')).status).toBe(400);
  });
});
