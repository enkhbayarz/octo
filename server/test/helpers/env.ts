/**
 * Disposable databases for the e2e suite: set TEST_DATABASE_URL / TEST_REDIS_URL
 * to any local Postgres and Redis. The database is dropped and recreated on
 * every run, so its name must end in "_test", and the Redis db is flushed.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://octolearn:octolearn@127.0.0.1:54329/octolearn_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:63790/1';
