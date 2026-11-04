import { expect, test } from 'vitest';

import { check } from './health.routes.js';

test('a dependency that hangs is reported down once the deadline passes', async () => {
  const result = await check(() => new Promise(() => {}), 20);
  expect(result).toMatchObject({ status: 'down', error: 'timed out after 20ms' });
  expect(result.latencyMs).toBeGreaterThanOrEqual(15);
});

test('errors are reported, not thrown', async () => {
  expect(await check(() => Promise.reject(new Error('refused')), 100)).toMatchObject({
    status: 'down',
    error: 'refused',
  });
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- third-party clients do reject with strings
  expect(await check(() => Promise.reject('plain'), 100)).toMatchObject({ error: 'plain' });
});
