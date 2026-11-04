import { z } from 'zod';

/** "a, b,,c" → ["a", "b", "c"]. */
const list = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const flag = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('::'),
    PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SERVICE_NAME: z.string().default('octolearn-api'),
    /** Railway sets RAILWAY_GIT_COMMIT_SHA; it is copied here in `loadConfig`. */
    RELEASE: z.string().default('dev'),

    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: int(10),
    DATABASE_STATEMENT_TIMEOUT_MS: int(10_000),
    REDIS_URL: z.url(),

    /** PEM public key: verifies session tokens without a network call. */
    CLERK_JWT_KEY: z
      .string()
      .optional()
      .transform((value) => value?.replaceAll('\\n', '\n')),
    /** Fallback when CLERK_JWT_KEY is missing: fetches Clerk's JWKS (cached). */
    CLERK_SECRET_KEY: z.string().optional(),
    /** Allowed `azp` claims, e.g. the web client's origin. Empty = not checked. */
    CLERK_AUTHORIZED_PARTIES: list,
    CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),

    /** Browser origins allowed to call the API (web client, admin dashboard). */
    CORS_ORIGINS: list,
    /** Bearer token for /metrics and /internal/stats. Without it they are closed in production. */
    METRICS_TOKEN: z.string().min(16).optional(),
    /** Read the client IP from X-Real-IP / X-Forwarded-For. True behind Railway's proxy. */
    TRUST_PROXY: flag,

    RATE_LIMIT_WINDOW_MS: int(60_000),
    /** Requests per window per client IP, across the whole API. */
    RATE_LIMIT_MAX: int(300),
    /** Requests per window per signed-in learner on /v1/me. */
    RATE_LIMIT_USER_MAX: int(120),
    /** Above this many concurrent requests, new ones get 503 instead of queueing. */
    MAX_IN_FLIGHT: int(256),
    REQUEST_TIMEOUT_MS: int(15_000),
    SHUTDOWN_TIMEOUT_MS: int(10_000),
  })
  .refine((env) => env.CLERK_JWT_KEY || env.CLERK_SECRET_KEY, {
    message: 'Set CLERK_JWT_KEY (recommended) or CLERK_SECRET_KEY',
    path: ['CLERK_JWT_KEY'],
  });

export type Config = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Validates the environment once at startup, so a bad deploy fails before it takes traffic. */
export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  // An empty variable means "not set" (dashboards often leave blank values behind).
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = EnvSchema.safeParse({
    ...present,
    RELEASE: present.RELEASE ?? present.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7),
  });
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid environment:\n${problems.join('\n')}`);
  }
  return result.data;
}
