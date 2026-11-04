import { describe, expect, test, vi } from 'vitest';

import { backoffDelay, retry } from './retry.js';

describe('backoffDelay', () => {
  const options = { baseMs: 100, maxMs: 1_000 };

  test('the ceiling doubles each attempt and is capped', () => {
    const atMost = () => 1;
    expect([0, 1, 2, 3, 4, 10].map((attempt) => backoffDelay(attempt, options, atMost))).toEqual([
      100, 200, 400, 800, 1_000, 1_000,
    ]);
  });

  test('full jitter: anywhere from 0 up to the ceiling', () => {
    expect(backoffDelay(3, options, () => 0)).toBe(0);
    expect(backoffDelay(3, options, () => 0.5)).toBe(400);
  });
});

describe('retry', () => {
  const fast = { baseMs: 1, maxMs: 2 };

  test('returns as soon as a call succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('flaky')).mockResolvedValue('ok');
    const onRetry = vi.fn();
    await expect(retry(fn, { ...fast, retries: 3, onRetry })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });

  test('gives up after the last retry with the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(retry(fn, { ...fast, retries: 2 })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("doesn't retry errors that aren't transient", async () => {
    const fn = vi.fn().mockRejectedValue(new Error('bad input'));
    await expect(retry(fn, { ...fast, retries: 5, shouldRetry: () => false })).rejects.toThrow(
      'bad input',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
