import { expect, test, vi } from 'vitest';

import type { Logger } from '../lib/logger.js';
import { type Database, waitForDatabase } from './client.js';

test('waits for a database that is still starting, logging each retry', async () => {
  const execute = vi
    .fn()
    .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    .mockResolvedValue({ rows: [] });
  const warn = vi.fn();
  await waitForDatabase({ execute } as unknown as Database, { warn } as unknown as Logger);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(warn).toHaveBeenCalledWith(
    expect.objectContaining({ attempt: 1, delayMs: expect.any(Number) }),
    'database not reachable yet, retrying',
  );
});
