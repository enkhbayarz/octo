import { setTimeout as sleep } from 'node:timers/promises';

export type BackoffOptions = {
  /** First delay ceiling in ms; doubles every attempt. */
  baseMs: number;
  /** Upper bound for any single delay. */
  maxMs: number;
};

/**
 * Exponential backoff with "full jitter": a random delay between 0 and the
 * exponential ceiling. The randomness spreads retries from many clients apart
 * so they don't hit a recovering dependency at the same instant.
 */
export function backoffDelay(
  attempt: number,
  { baseMs, maxMs }: BackoffOptions,
  random = Math.random,
) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(random() * ceiling);
}

export type RetryOptions = BackoffOptions & {
  /** Retries after the first try; 3 means up to 4 calls in total. */
  retries: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, shouldRetry = () => true, onRetry } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      const delay = backoffDelay(attempt, options);
      onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
}
