import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { xpEvents } from '../../src/db/schema/index.js';
import { startTestApp, type TestApp } from '../helpers/harness.js';
import { completeLessons } from '../helpers/learning.js';

// A controllable clock: 10:00 UTC = 18:00 in Ulaanbaatar (the default time zone).
let now = new Date('2026-11-04T10:00:00Z');
const setDay = (iso: string) => {
  now = new Date(iso);
};

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp({}, { clock: () => now });
});
afterAll(() => app.close());

const complete = (token: string, lessonId: string) =>
  app.call(`/v1/me/lessons/${lessonId}/complete`, { method: 'POST', token });

describe('POST /v1/me/lessons/:lessonId/complete', () => {
  test('awards 10 XP and starts the streak', async () => {
    setDay('2026-11-04T10:00:00Z');
    const { token } = await app.newLearner();
    const { status, body } = await complete(token, 'u1-l1');
    expect(status).toBe(200);
    expect(body.data).toEqual({
      lessonId: 'u1-l1',
      xpGained: 10,
      streakIncreased: true,
      alreadyCompleted: false,
      totals: { xp: 10, streak: 1 },
    });
  });

  test('is idempotent: completing again changes nothing', async () => {
    const { token } = await app.newLearner();
    await complete(token, 'u1-l1');
    const { status, body } = await complete(token, 'u1-l1');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      xpGained: 0,
      alreadyCompleted: true,
      totals: { xp: 10, streak: 1 },
    });
  });

  test('race: 10 simultaneous completions of one lesson award XP exactly once', async () => {
    const { token, id } = await app.newLearner();
    const replies = await Promise.all(Array.from({ length: 10 }, () => complete(token, 'u1-l1')));
    expect(replies.map((reply) => reply.status)).toEqual(Array(10).fill(200));
    expect(replies.filter((reply) => reply.body.data.xpGained === 10)).toHaveLength(1);
    const events = await app.deps.db
      .select()
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, id)));
    expect(events).toHaveLength(1);
    expect((await app.call('/v1/me', { token })).body.data.xp).toBe(10);
  });

  test('race: overlapping writes and reads for one learner never lose an XP update', async () => {
    const { token } = await app.newLearner();
    await completeLessons(app, token, ['u1-l1', 'u1-l2', 'u1-l3']);
    const replies = await Promise.all([
      complete(token, 'u1-l4'),
      complete(token, 'u1-l4'),
      app.call('/v1/me/progress', { token }),
      complete(token, 'u1-l4'),
    ]);
    expect(replies.every((reply) => reply.status === 200)).toBe(true);
    expect((await app.call('/v1/me', { token })).body.data.xp).toBe(40);
  });

  test('locked lessons are refused with ITEM_LOCKED', async () => {
    const { token } = await app.newLearner();
    const { status, body } = await complete(token, 'u1-l3');
    expect(status).toBe(409);
    expect(body.error).toMatchObject({
      code: 'ITEM_LOCKED',
      message: 'Finish the previous lesson or quiz first',
    });
  });

  test("the next unit stays locked until the previous unit's quiz is passed", async () => {
    const { token } = await app.newLearner();
    await completeLessons(app, token, ['u1-l1', 'u1-l2', 'u1-l3', 'u1-l4', 'u1-l5']);
    expect((await complete(token, 'u2-l1')).status).toBe(409);
  });

  test('unknown lesson → 404', async () => {
    const { token } = await app.newLearner();
    const { status, body } = await complete(token, 'u9-l9');
    expect(status).toBe(404);
    expect(body.error.message).toBe('Lesson "u9-l9" not found');
  });
});

describe('streaks follow the learner’s own calendar', () => {
  test('consecutive days grow the streak; a missed day restarts it', async () => {
    const { token } = await app.newLearner();

    setDay('2026-11-04T10:00:00Z');
    expect((await complete(token, 'u1-l1')).body.data.totals.streak).toBe(1);
    // Same day again: no change.
    expect((await complete(token, 'u1-l2')).body.data).toMatchObject({
      streakIncreased: false,
      totals: { streak: 1 },
    });

    setDay('2026-11-05T10:00:00Z');
    expect((await complete(token, 'u1-l3')).body.data).toMatchObject({
      streakIncreased: true,
      totals: { streak: 2 },
    });

    // Nothing on the 6th: the streak shown lapses, and restarts on the 7th.
    setDay('2026-11-07T10:00:00Z');
    expect((await app.call('/v1/me', { token })).body.data.streak).toBe(0);
    expect((await complete(token, 'u1-l4')).body.data.totals.streak).toBe(1);
  });

  test("day boundaries use the learner's time zone, not UTC", async () => {
    const { token } = await app.newLearner();
    await app.call('/v1/me', { method: 'PATCH', token, json: { timezone: 'America/Los_Angeles' } });

    // 23:00 on the 4th in Los Angeles is already the 5th in UTC.
    setDay('2026-11-05T07:00:00Z');
    await complete(token, 'u1-l1');
    // 01:00 on the 5th in Los Angeles: the next local day, so the streak grows.
    setDay('2026-11-05T09:00:00Z');
    expect((await complete(token, 'u1-l2')).body.data.totals.streak).toBe(2);

    const { body } = await app.call('/v1/me/progress', { token });
    expect(body.data.streak.lastActiveDay).toBe('2026-11-05');
    expect(body.data.activity.slice(-2)).toEqual([
      { day: '2026-11-04', xp: 10 },
      { day: '2026-11-05', xp: 10 },
    ]);
  });
});

describe('video progress', () => {
  const save = (token: string, lessonId: string, positionSec: number, furthestSec: number) =>
    app.call(`/v1/me/lessons/${lessonId}/video-progress`, {
      method: 'PUT',
      token,
      json: { positionSec, furthestSec },
    });

  test('furthest only moves forward; position can go back', async () => {
    const { token } = await app.newLearner();
    expect((await save(token, 'u1-l1', 4, 6)).body.data).toEqual({
      lessonId: 'u1-l1',
      completed: false,
      positionSec: 4,
      furthestSec: 6,
    });
    // Rewound to 2s; an older, smaller "furthest" arriving late doesn't move it back.
    expect((await save(token, 'u1-l1', 2, 3)).body.data).toMatchObject({
      positionSec: 2,
      furthestSec: 6,
    });
  });

  test('values beyond the video are clamped to its length', async () => {
    const { token } = await app.newLearner();
    const { body } = await save(token, 'u1-l1', 5_000, 5_000);
    expect(body.data).toMatchObject({ positionSec: 739, furthestSec: 739 }); // u1-l1 is 12:19
  });

  test('finished lessons drop their resume point and ignore new ones', async () => {
    const { token } = await app.newLearner();
    await save(token, 'u1-l1', 5, 9);
    await complete(token, 'u1-l1');
    expect((await save(token, 'u1-l1', 1, 1)).body.data).toEqual({
      lessonId: 'u1-l1',
      completed: true,
      positionSec: null,
      furthestSec: null,
    });
    expect((await app.call('/v1/me/progress', { token })).body.data.videoProgress).toEqual({});
  });

  test('invalid values and unknown lessons are refused', async () => {
    const { token } = await app.newLearner();
    expect((await save(token, 'u1-l1', -1, 2)).status).toBe(400);
    expect((await save(token, 'nope', 1, 2)).status).toBe(404);
  });
});

describe('GET /v1/me/progress', () => {
  test('returns everything the app shows, in one consistent snapshot', async () => {
    setDay('2026-11-04T10:00:00Z');
    const { token } = await app.newLearner();
    await completeLessons(app, token, ['u1-l1', 'u1-l2']);
    await save(token, 'u1-l3', 3, 7);

    const { status, body } = await app.call('/v1/me/progress', { token });
    expect(status).toBe(200);
    expect(body.data).toEqual({
      xp: 20,
      streak: { count: 1, lastActiveDay: '2026-11-04' },
      completedLessons: ['u1-l1', 'u1-l2'],
      quizResults: {},
      videoProgress: { 'u1-l3': { positionSec: 3, furthestSec: 7 } },
      activity: [
        { day: '2026-10-29', xp: 0 },
        { day: '2026-10-30', xp: 0 },
        { day: '2026-10-31', xp: 0 },
        { day: '2026-11-01', xp: 0 },
        { day: '2026-11-02', xp: 0 },
        { day: '2026-11-03', xp: 0 },
        { day: '2026-11-04', xp: 20 },
      ],
    });
  });

  function save(token: string, lessonId: string, positionSec: number, furthestSec: number) {
    return app.call(`/v1/me/lessons/${lessonId}/video-progress`, {
      method: 'PUT',
      token,
      json: { positionSec, furthestSec },
    });
  }
});
