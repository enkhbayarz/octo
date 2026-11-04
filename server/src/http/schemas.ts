import { z } from '@hono/zod-openapi';

/**
 * Response shapes shared by every route.
 *
 * Success: `{ "data": ... }`
 * Failure: `{ "error": { "code", "message", "details"?, "requestId" } }`
 */
export const ErrorBodySchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_FAILED' }),
      message: z.string().openapi({ example: 'Request validation failed' }),
      details: z.unknown().optional(),
      requestId: z.string().openapi({ example: '6f1c2d3e-…' }),
    }),
  })
  .openapi('Error');

export const dataOf = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});

/** Error responses documented on routes (the handler is the same for all). */
export const errors = {
  400: errorResponse('Invalid request'),
  401: errorResponse('Missing or invalid session token'),
  404: errorResponse('Not found'),
  409: errorResponse('Conflicts with the current state'),
  422: errorResponse('Idempotency key reused with a different request'),
  429: errorResponse('Too many requests'),
  503: errorResponse('Temporarily unavailable'),
} as const;

export const LocalizedSchema = z.object({ mn: z.string(), en: z.string() }).openapi('Localized');

export const bearerSecurity = [{ bearerAuth: [] }];
