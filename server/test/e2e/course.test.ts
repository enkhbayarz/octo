import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { courses } from '../../src/db/schema/index.js';

import { seedCourse } from '../../src/db/seed.js';
import courseJson from '../../src/db/seed-data/course.json' with { type: 'json' };
import { courseCacheKey } from '../../src/modules/course/course.service.js';
import { startTestApp, type TestApp } from '../helpers/harness.js';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
  await app.deps.redis.del(courseCacheKey('english-a1'), 'cache:courses');
});
afterAll(() => app.close());

describe('GET /v1/courses', () => {
  test('lists published courses with counts', async () => {
    const { status, body } = await app.call('/v1/courses');
    expect(status).toBe(200);
    expect(body.data).toEqual([
      {
        id: 'english-a1',
        title: { mn: 'Англи хэл — Анхан шат', en: 'English — Beginner' },
        shortTitle: expect.any(Object),
        unitCount: 2,
        lessonCount: 10,
      },
    ]);
  });
});

describe('GET /v1/courses/:courseId', () => {
  test('returns the whole course in the shape of the brief', async () => {
    const { status, body } = await app.call('/v1/courses/english-a1');
    expect(status).toBe(200);
    const course = body.data;
    expect(course.units).toHaveLength(2);
    expect(course.units.flatMap((unit: any) => unit.lessons)).toHaveLength(10);
    expect(course.units[0].lessons[0]).toMatchObject({
      id: 'u1-l1',
      title: { mn: expect.any(String), en: expect.any(String) },
      // No PUBLIC_URL in tests, so the media path comes back as stored.
      videoUrl: '/media/videos/u1-l1/master.m3u8',
      durationSec: 739,
    });
    // The brief: 10–15 minute lesson videos.
    for (const lesson of course.units.flatMap((unit: any) => unit.lessons)) {
      expect(lesson.durationSec).toBeGreaterThanOrEqual(600);
      expect(lesson.durationSec).toBeLessThanOrEqual(900);
    }
    expect(course.units[0].quiz).toMatchObject({ id: 'u1-quiz', passPercent: 60 });
    expect(course.units[0].quiz.questions[0]).toMatchObject({
      text: '“Hello” гэдэг ямар утгатай вэ?',
      options: ['Баяртай', 'Сайн байна уу', 'Баярлалаа'],
      answerIndex: 1,
    });
  });

  test('keeps lessons and questions in order', async () => {
    const { body } = await app.call('/v1/courses/english-a1');
    expect(body.data.units[1].lessons.map((lesson: any) => lesson.id)).toEqual([
      'u2-l1',
      'u2-l2',
      'u2-l3',
      'u2-l4',
      'u2-l5',
    ]);
  });

  test('is cached in Redis after the first read', async () => {
    await app.call('/v1/courses/english-a1');
    expect(await app.deps.redis.exists(courseCacheKey('english-a1'))).toBe(1);
    const ttl = await app.deps.redis.ttl(courseCacheKey('english-a1'));
    expect(ttl).toBeGreaterThan(3_000);
    expect(ttl).toBeLessThanOrEqual(3_960);
  });

  test('cache stampede: 25 simultaneous cold reads load from Postgres once', async () => {
    await app.deps.redis.del(courseCacheKey('english-a1'));
    const loads = async () =>
      (await app.deps.metrics.cacheLoads.get()).values.find((v) => v.labels.cache === 'course')
        ?.value ?? 0;
    const before = await loads();
    const replies = await Promise.all(
      Array.from({ length: 25 }, () => app.call('/v1/courses/english-a1')),
    );
    expect(replies.every((reply) => reply.status === 200)).toBe(true);
    expect((await loads()) - before).toBe(1);
  });

  test('supports conditional requests: same ETag → 304 with no body', async () => {
    const first = await app.call('/v1/courses/english-a1');
    const etag = first.headers.get('etag')!;
    expect(etag).toMatch(/^"[\w-]+"$/);
    expect(first.headers.get('cache-control')).toContain('max-age=60');

    const again = await app.call('/v1/courses/english-a1', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    expect(again.body).toBeNull();

    const weak = await app.call('/v1/courses/english-a1', {
      headers: { 'If-None-Match': `"other", W/${etag}` },
    });
    expect(weak.status).toBe(304);
  });

  test('unknown course → 404 envelope, and it is not cached', async () => {
    const { status, body } = await app.call('/v1/courses/klingon-b2');
    expect(status).toBe(404);
    expect(body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Course "klingon-b2" not found',
    });
    expect(await app.deps.redis.exists(courseCacheKey('klingon-b2'))).toBe(0);
  });

  test('rejects malformed ids before touching the database', async () => {
    const { status, body } = await app.call('/v1/courses/DROP%20TABLE');
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0]).toMatchObject({ in: 'param', path: 'courseId' });
  });

  test('new content shows up once the cache is invalidated (what the seed step does)', async () => {
    const before = await app.call('/v1/courses/english-a1');
    const edited = structuredClone(courseJson);
    edited.units[0]!.lessons[0]!.title.en = 'Greetings, revised';
    const { cacheKeys } = await seedCourse(app.deps.db, edited);
    await app.deps.redis.del(...cacheKeys);

    const after = await app.call('/v1/courses/english-a1');
    expect(after.body.data.units[0].lessons[0].title.en).toBe('Greetings, revised');
    expect(after.headers.get('etag')).not.toBe(before.headers.get('etag'));

    await seedCourse(app.deps.db, courseJson);
    await app.deps.redis.del(...cacheKeys);
  });

  test('unpublished (draft) content is invisible: not listed, not served, not learnable', async () => {
    const { cacheKeys } = await seedCourse(app.deps.db, courseJson);
    const { token } = await app.newLearner();
    await app.deps.db.update(courses).set({ status: 'draft' }).where(eq(courses.id, 'english-a1'));
    await app.deps.redis.del(...cacheKeys);
    try {
      expect((await app.call('/v1/courses')).body.data).toEqual([]);
      expect((await app.call('/v1/courses/english-a1')).status).toBe(404);
      expect(
        (await app.call('/v1/me/lessons/u1-l1/complete', { method: 'POST', token })).status,
      ).toBe(404);
    } finally {
      await app.deps.db
        .update(courses)
        .set({ status: 'published' })
        .where(eq(courses.id, 'english-a1'));
      await app.deps.redis.del(...cacheKeys);
    }
  });

  test('still serves the course when Redis is unreachable', async () => {
    const degraded = await startTestApp({ REDIS_URL: 'redis://127.0.0.1:1' });
    try {
      const { status, body } = await degraded.call('/v1/courses/english-a1');
      expect(status).toBe(200);
      expect(body.data.units).toHaveLength(2);
    } finally {
      await degraded.close();
    }
  });
});
