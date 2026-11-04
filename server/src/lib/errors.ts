/**
 * Every failure the API returns has a stable machine-readable `code`. Clients
 * branch on the code, never on the message, so messages can change freely.
 */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ITEM_LOCKED: 409,
  PAYLOAD_TOO_LARGE: 413,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
  TIMEOUT: 504,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type ErrorStatus = (typeof ERROR_STATUS)[ErrorCode];

export class AppError extends Error {
  override name = 'AppError';
  readonly status: ErrorStatus;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.status = ERROR_STATUS[code];
  }
}
