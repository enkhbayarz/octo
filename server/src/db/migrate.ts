import { fileURLToPath, pathToFileURL } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { z } from 'zod';

import { retry } from '../lib/retry.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
/** Any constant works; it only has to be the same for every migrator. */
const MIGRATION_LOCK_ID = 72_100_001;

/**
 * Applies pending SQL migrations from `drizzle/`. Runs as Railway's pre-deploy
 * command, before the new version takes traffic. An advisory lock makes two
 * overlapping deploys queue up instead of migrating at the same time.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new pg.Client({
    connectionString: databaseUrl,
    application_name: 'octolearn-migrate',
  });
  await retry(() => client.connect(), { retries: 8, baseMs: 250, maxMs: 5_000 });
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle({ client, casing: 'snake_case' }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    await client.end();
  }
}

/* v8 ignore start -- CLI entry, exercised as a child process in test/e2e/process.test.ts */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { DATABASE_URL } = z.object({ DATABASE_URL: z.url() }).parse(process.env);
  await runMigrations(DATABASE_URL);
  console.log('migrations applied');
}
/* v8 ignore stop */
