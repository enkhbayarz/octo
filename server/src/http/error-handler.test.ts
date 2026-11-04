import { HTTPException } from 'hono/http-exception';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { pgErrorCode } from '../db/transaction.js';
import { AppError } from '../lib/errors.js';
import { toAppError, validationError } from './error-handler.js';

const pgError = (code: string) => Object.assign(new Error('db'), { code });
/** How Drizzle reports driver errors: its own error with the pg error as `cause`. */
const wrapped = (code: string) => new Error('Failed query: …', { cause: pgError(code) });

describe('toAppError', () => {
  test('keeps AppErrors as they are', () => {
    const error = new AppError('ITEM_LOCKED', 'locked');
    expect(toAppError(error)).toBe(error);
  });

  test.each([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [404, 'NOT_FOUND'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [503, 'SERVICE_UNAVAILABLE'],
    [504, 'TIMEOUT'],
    [418, 'INTERNAL'],
  ] as const)('maps HTTP %i from middleware to %s', (status, code) => {
    expect(toAppError(new HTTPException(status)).code).toBe(code);
  });

  test.each([
    ['23505', 'CONFLICT', 409],
    ['23503', 'CONFLICT', 409],
    ['40001', 'SERVICE_UNAVAILABLE', 503],
    ['40P01', 'SERVICE_UNAVAILABLE', 503],
    ['57014', 'SERVICE_UNAVAILABLE', 503],
    ['55P03', 'SERVICE_UNAVAILABLE', 503],
    ['53300', 'SERVICE_UNAVAILABLE', 503],
  ])('maps Postgres %s (wrapped by Drizzle) to %s', (sqlState, code, status) => {
    const error = toAppError(wrapped(sqlState));
    expect(error).toMatchObject({ code, status });
  });

  test('an exhausted connection pool is a 503, not a 500, even when Drizzle wraps it', () => {
    const poolTimeout = new Error('timeout exceeded when trying to connect');
    expect(toAppError(poolTimeout).code).toBe('SERVICE_UNAVAILABLE');
    // Found by load testing: Drizzle reports it as "Failed query: …" with the pool error as cause.
    const wrapped = new Error('Failed query: select 1\nparams: ', { cause: poolTimeout });
    expect(toAppError(wrapped).code).toBe('SERVICE_UNAVAILABLE');
  });

  test('unknown errors become INTERNAL without leaking their message', () => {
    const error = toAppError(new Error('password=hunter2 in connection string'));
    expect(error).toMatchObject({ code: 'INTERNAL', status: 500, message: 'Something went wrong' });
    expect(toAppError('a string').code).toBe('INTERNAL');
  });
});

describe('pgErrorCode', () => {
  test('finds the SQLSTATE through the cause chain, or nothing', () => {
    expect(pgErrorCode(wrapped('23505'))).toBe('23505');
    expect(pgErrorCode(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
  });
});

describe('validationError', () => {
  test('one detail per invalid field, with where it came from', () => {
    const result = z.object({ name: z.string(), age: z.number() }).safeParse({ age: 'x' });
    const error = validationError(result.error!, 'json');
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([
      expect.objectContaining({ in: 'json', path: 'name' }),
      expect.objectContaining({ in: 'json', path: 'age' }),
    ]);
  });
});
