import type { PgTransactionConfig } from 'drizzle-orm/pg-core';

import { retry } from '../lib/retry.js';
import type { Database, Transaction } from './client.js';

/** Postgres SQLSTATE codes the app reacts to. */
export const PgCode = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  serializationFailure: '40001',
  deadlockDetected: '40P01',
  queryCanceled: '57014',
  lockNotAvailable: '55P03',
  tooManyConnections: '53300',
} as const;

/** An error and the errors it wraps (`cause`), outermost first. Drizzle wraps every driver error. */
export function* causeChain(error: unknown): Generator<unknown> {
  let current = error;
  for (let depth = 0; current && depth < 5; depth++) {
    yield current;
    current = (current as { cause?: unknown }).cause;
  }
}

export function pgErrorCode(error: unknown): string | undefined {
  for (const link of causeChain(error)) {
    const code = (link as { code?: unknown }).code;
    if (typeof code === 'string' && code.length === 5) return code;
  }
  return undefined;
}

const RETRYABLE = new Set<string>([PgCode.serializationFailure, PgCode.deadlockDetected]);

/**
 * Runs `fn` in a transaction and retries it, with backoff and jitter, when
 * Postgres aborts it for a serialization failure or a deadlock. Both are safe
 * to retry because the aborted attempt left nothing behind. `fn` must not
 * cause side effects outside the database, since it may run more than once.
 */
export function withTransaction<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
  config?: PgTransactionConfig,
): Promise<T> {
  return retry(() => db.transaction(fn, config), {
    retries: 3,
    baseMs: 20,
    maxMs: 400,
    shouldRetry: (error) => RETRYABLE.has(pgErrorCode(error) ?? ''),
  });
}
