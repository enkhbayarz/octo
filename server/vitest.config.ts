import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.test.ts'],
          globalSetup: ['test/global-setup.ts'],
          // One file at a time: they share a database and assert on global things like the leaderboard.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Process entry points run as real child processes in test/e2e/process.test.ts, which
      // in-process coverage can't see; schema files are declarations read by drizzle-kit.
      exclude: [
        'src/**/*.test.ts',
        'src/db/seed-data/**',
        'src/db/schema/**',
        'src/index.ts',
        'src/instrumentation.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
