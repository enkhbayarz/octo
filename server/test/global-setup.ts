import { Redis } from 'ioredis';
import pg from 'pg';

import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedCourse } from '../src/db/seed.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './helpers/env.js';

/** Fresh database from the real migrations + seed, and an empty Redis, before the e2e suite. */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!name.endsWith('_test'))
    throw new Error(`Refusing to reset "${name}": test databases must end in _test`);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();

  await runMigrations(TEST_DATABASE_URL);
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  await seedCourse(createDb(pool));
  await pool.end();

  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  await redis.flushdb();
  redis.disconnect();
}
