import { lt, sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { idempotencyKeys } from '../db/schema/index.js';
import type { Logger } from '../lib/logger.js';

const CLEANUP_LOCK_ID = 72_100_002;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Hourly housekeeping inside the API process: drops idempotency keys older
 * than 24 hours. With several replicas each one schedules it, but a Postgres
 * advisory lock lets only one run it at a time; the others skip.
 */
export function startCleanupJob({
  db,
  logger,
  intervalMs = HOUR_MS,
}: {
  db: Database;
  logger: Logger;
  intervalMs?: number;
}) {
  async function run(): Promise<number | null> {
    try {
      return await db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ locked: boolean }>(
          sql`select pg_try_advisory_xact_lock(${CLEANUP_LOCK_ID}) as locked`,
        );
        if (!rows[0]?.locked) return null;
        const result = await tx
          .delete(idempotencyKeys)
          .where(lt(idempotencyKeys.createdAt, sql`now() - interval '24 hours'`));
        const removed = result.rowCount ?? 0;
        if (removed > 0) logger.info({ removed }, 'expired idempotency keys removed');
        return removed;
      });
    } catch (err) {
      logger.error({ err }, 'cleanup job failed');
      return null;
    }
  }

  // First run after a random 30–60s, so replicas started together don't all fire at once.
  const first = setTimeout(() => void run(), 30_000 + Math.random() * 30_000);
  const timer = setInterval(() => void run(), intervalMs);
  first.unref();
  timer.unref();

  return {
    run,
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}
