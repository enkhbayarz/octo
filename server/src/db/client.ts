import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import type { Logger } from '../lib/logger.js';
import { retry } from '../lib/retry.js';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Repositories accept either, so the caller decides whether work joins a transaction. */
export type Executor = Database | Transaction;

type PoolOptions = {
  url: string;
  max: number;
  statementTimeoutMs: number;
  applicationName: string;
};

/**
 * One pool per process. Size it so that `replicas × max` stays well under the
 * server's max_connections (Railway Postgres: 100), leaving room for
 * migrations and a psql session.
 */
export function createPool(options: PoolOptions, logger: Logger): pg.Pool {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.max,
    // Fail a request quickly instead of queueing forever when every connection is busy.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Recycle connections so a failover or a DNS change is picked up.
    maxLifetimeSeconds: 30 * 60,
    application_name: options.applicationName,
    // A runaway query or a forgotten open transaction can't hold locks forever.
    statement_timeout: options.statementTimeoutMs,
    idle_in_transaction_session_timeout: 15_000,
    // Waiting on a row lock holds a pooled connection; give up after 3s (→ 503, retry)
    // so one hot row can't tie up the whole pool.
    lock_timeout: 3_000,
  });
  // An idle client losing its connection emits here; without a listener the process would crash.
  pool.on('error', (err) => logger.error({ err }, 'idle database connection failed'));
  return pool;
}

export function createDb(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}

/** Startup gate: on Railway the database can come up a few seconds after the app. */
export async function waitForDatabase(db: Database, logger: Logger): Promise<void> {
  await retry(() => db.execute(sql`select 1`), {
    retries: 8,
    baseMs: 250,
    maxMs: 5_000,
    onRetry: (err, attempt, delayMs) =>
      logger.warn({ err, attempt, delayMs }, 'database not reachable yet, retrying'),
  });
}
