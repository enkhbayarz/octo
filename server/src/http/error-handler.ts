import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodError } from 'zod';

import { causeChain, PgCode, pgErrorCode } from '../db/transaction.js';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { AppEnv } from './context.js';

export function validationError(error: ZodError, target?: string): AppError {
  return new AppError(
    'VALIDATION_FAILED',
    'Request validation failed',
    error.issues.map((issue) => ({
      in: target,
      path: issue.path.join('.'),
      message: issue.message,
    })),
  );
}

/** Turns anything thrown into an AppError. Unknown errors never leak their message. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof HTTPException) {
    const byStatus: Record<number, AppError> = {
      400: new AppError('BAD_REQUEST', error.message || 'Bad request'),
      401: new AppError('UNAUTHORIZED', 'Authentication required'),
      404: new AppError('NOT_FOUND', 'Not found'),
      413: new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large'),
      503: new AppError('SERVICE_UNAVAILABLE', 'Temporarily unavailable'),
      504: new AppError('TIMEOUT', 'The request took too long'),
    };
    return (
      byStatus[error.status] ??
      new AppError('INTERNAL', 'Something went wrong', undefined, { cause: error })
    );
  }

  switch (pgErrorCode(error)) {
    case PgCode.uniqueViolation:
      return new AppError('CONFLICT', 'That already exists', undefined, { cause: error });
    case PgCode.foreignKeyViolation:
      return new AppError('CONFLICT', 'A referenced record no longer exists', undefined, {
        cause: error,
      });
    case PgCode.serializationFailure:
    case PgCode.deadlockDetected:
    case PgCode.queryCanceled:
    case PgCode.lockNotAvailable:
    case PgCode.tooManyConnections:
      return new AppError('SERVICE_UNAVAILABLE', 'The database is busy, please retry', undefined, {
        cause: error,
      });
  }

  // node-postgres when every pooled connection stays busy past connectionTimeoutMillis
  // (arrives wrapped in Drizzle's query error, so look through the causes).
  const poolExhausted = [...causeChain(error)].some(
    (link) =>
      link instanceof Error && /timeout exceeded when trying to connect/i.test(link.message),
  );
  if (poolExhausted) {
    return new AppError('SERVICE_UNAVAILABLE', 'The database is busy, please retry', undefined, {
      cause: error,
    });
  }

  return new AppError('INTERNAL', 'Something went wrong', undefined, { cause: error });
}

export function errorResponse(c: Context<AppEnv>, error: AppError) {
  // The rate limiter sets its own Retry-After before throwing; 503s are worth a quick retry.
  if (error.status === 503) c.header('Retry-After', '1');
  return c.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        requestId: c.var.requestId,
      },
    },
    error.status,
  );
}

export function createErrorHandler(fallbackLogger: Logger): ErrorHandler<AppEnv> {
  return (err, c) => {
    const error = toAppError(err);
    const log = c.var.log ?? fallbackLogger;
    // 503s are expected under load or during a dependency blip; a bug is a 500.
    if (error.status >= 500 && error.status !== 503)
      log.error({ err, code: error.code }, 'request failed');
    else if (error.status === 503) log.warn({ err, code: error.code }, 'request refused');
    else log.debug({ code: error.code, message: error.message }, 'request rejected');
    return errorResponse(c, error);
  };
}

export const notFound: NotFoundHandler<AppEnv> = (c) =>
  errorResponse(c, new AppError('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`));
