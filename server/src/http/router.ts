import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from 'hono';

import { validationError } from './error-handler.js';

/**
 * Every router validates requests with Zod and reports failures in the same
 * error envelope, with one entry per invalid field.
 */
export function createRouter<E extends Env>() {
  return new OpenAPIHono<E>({
    defaultHook: (result) => {
      if (!result.success) throw validationError(result.error, result.target);
    },
  });
}
