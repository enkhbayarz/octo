import { randomUUID } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { idempotencyKeys, users } from '../../src/db/schema/index.js';
import { createCache } from '../../src/cache/cache.js';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { withTransaction } from '../../src/db/transaction.js';
import { createCourseService } from '../../src/modules/course/course.service.js';
import { createLeaderboardService } from '../../src/modules/leaderboard/leaderboard.service.js';
import { createProgressService } from '../../src/modules/progress/progress.service.js';
import { createUsersService } from '../../src/modules/users/users.service.js';
import { TEST_DATABASE_URL } from '../helpers/env.js';
import { startCleanupJob } from '../../src/jobs/cleanup.js';
import { newClerkId, startTestApp, type TestApp } from '../helpers/harness.js';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.close());

describe('migrations', () => {
  test('re-running them is a no-op (the pre-deploy step runs on every deploy)', async () => {
    await expect(runMigrations(TEST_DATABASE_URL)).resolves.toBeUndefined();
  });
});

describe('transactions', () => {
  test('SERIALIZABLE write skew: Postgres aborts one transaction, withTransaction retries it', async () => {
    const [a, b] = await app.deps.db
      .insert(users)
      .values([{ clerkUserId: newClerkId() }, { clerkUserId: newClerkId() }])
      .returning({ id: users.id });
    const ids = [a!.id, b!.id];

    // Both read the same rows, then each writes a different one: a classic write skew
    // that READ COMMITTED would allow and SERIALIZABLE must refuse.
    let bothRead!: () => void;
    const barrier = new Promise<void>((resolve) => {
      let reads = 0;
      bothRead = () => ++reads === 2 && resolve();
    });
    let attempts = 0;
    const bump = (id: string) =>
      withTransaction(
        app.deps.db,
        async (tx) => {
          attempts++;
          await tx
            .select({ xp: sql<number>`sum(${users.xp})` })
            .from(users)
            .where(inArray(users.id, ids));
          bothRead();
          await barrier;
          await tx
            .update(users)
            .set({ xp: sql`${users.xp} + 1` })
            .where(eq(users.id, id));
        },
        { isolationLevel: 'serializable' },
      );

    await Promise.all([bump(ids[0]!), bump(ids[1]!)]);
    expect(attempts).toBeGreaterThan(2); // at least one retry happened
    const rows = await app.deps.db
      .select({ xp: users.xp })
      .from(users)
      .where(inArray(users.id, ids));
    expect(rows.map((row) => row.xp)).toEqual([1, 1]); // and both writes landed exactly once
  });

  test('constraints guard the data even if application code is wrong', async () => {
    const [user] = await app.deps.db
      .insert(users)
      .values({ clerkUserId: newClerkId() })
      .returning();
    await expect(
      app.deps.db.update(users).set({ xp: -5 }).where(eq(users.id, user!.id)),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      app.deps.db.insert(users).values({ clerkUserId: user!.clerkUserId }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});

describe('an account deleted while its request is in flight', () => {
  test('progress and profile calls are refused rather than resurrecting the account', async () => {
    const { db, redis, logger, metrics, clock } = app.deps;
    const course = createCourseService({ db, cache: createCache({ redis, logger, metrics }) });
    const leaderboard = createLeaderboardService({ db, redis, logger, metrics, clock });
    const progress = createProgressService({ db, course, leaderboard, clock });
    const profiles = createUsersService({ db, clock });
    const gone = randomUUID();

    await expect(progress.completeLesson(gone, 'u1-l1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(progress.getProgress(gone)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(profiles.getProfile(gone)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('cleanup job', () => {
  test('a failing run is logged and does not crash the process', async () => {
    const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
    await pool.end();
    const job = startCleanupJob({ db: createDb(pool), logger: app.deps.logger });
    try {
      expect(await job.run()).toBeNull();
    } finally {
      job.stop();
    }
  });

  test('removes idempotency keys older than a day, keeps fresh ones', async () => {
    const [user] = await app.deps.db
      .insert(users)
      .values({ clerkUserId: newClerkId() })
      .returning();
    const row = (key: string, ageHours: number) => ({
      userId: user!.id,
      key,
      requestHash: 'h',
      responseStatus: 201,
      responseBody: {},
      createdAt: new Date(Date.now() - ageHours * 3_600_000),
    });
    const oldKey = randomUUID();
    const freshKey = randomUUID();
    await app.deps.db.insert(idempotencyKeys).values([row(oldKey, 30), row(freshKey, 1)]);

    const job = startCleanupJob({ db: app.deps.db, logger: app.deps.logger });
    try {
      expect(await job.run()).toBeGreaterThanOrEqual(1);
    } finally {
      job.stop();
    }
    const left = await app.deps.db
      .select({ key: idempotencyKeys.key })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, user!.id));
    expect(left.map((entry) => entry.key)).toEqual([freshKey]);
  });

  test('only one replica runs it at a time (advisory lock)', async () => {
    const job = startCleanupJob({ db: app.deps.db, logger: app.deps.logger });
    const holder = await app.deps.pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock(72100002)');
      expect(await job.run()).toBeNull(); // skipped, not blocked
    } finally {
      await holder.query('rollback');
      holder.release();
      job.stop();
    }
  });
});
