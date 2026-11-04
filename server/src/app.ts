import { Scalar } from '@scalar/hono-api-reference';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { timeout } from 'hono/timeout';
import { timing } from 'hono/timing';
import type pg from 'pg';

import { createCache } from './cache/cache.js';
import type { Redis } from './cache/redis.js';
import type { Config } from './config/env.js';
import type { Database } from './db/client.js';
import type { AppEnv, AuthedEnv } from './http/context.js';
import { createErrorHandler, errorResponse, notFound } from './http/error-handler.js';
import { requireUser, type VerifyToken } from './http/middleware/auth.js';
import { loadShed } from './http/middleware/load-shed.js';
import { observe } from './http/middleware/observe.js';
import { clientIp, rateLimit } from './http/middleware/rate-limit.js';
import { createRouter } from './http/router.js';
import { AppError } from './lib/errors.js';
import type { Logger } from './lib/logger.js';
import { courseRoutes } from './modules/course/course.routes.js';
import type { MediaStore } from './media/store.js';
import { createCourseService } from './modules/course/course.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { leaderboardRoutes } from './modules/leaderboard/leaderboard.routes.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { createLeaderboardService } from './modules/leaderboard/leaderboard.service.js';
import { createProgressService } from './modules/progress/progress.service.js';
import { systemRoutes } from './modules/system/system.routes.js';
import { meRoutes } from './modules/users/me.routes.js';
import { createUsersService } from './modules/users/users.service.js';
import { clerkWebhookRoutes } from './modules/webhooks/clerk-webhook.routes.js';
import type { Metrics } from './observability/metrics.js';
import type { RuntimeStats } from './observability/runtime-stats.js';

/** Everything the app needs from the outside world, passed in so tests can build it for real. */
export type AppDeps = {
  config: Config;
  logger: Logger;
  pool: pg.Pool;
  db: Database;
  redis: Redis;
  metrics: Metrics;
  runtimeStats: RuntimeStats;
  /** Lesson videos in the bucket; null when the bucket isn't configured. */
  media: MediaStore | null;
  verifyToken: VerifyToken;
  clock: () => Date;
  state: { shuttingDown: boolean };
};

export function createApp(deps: AppDeps) {
  const { config, logger, db, redis, metrics, clock, state } = deps;

  const cache = createCache({ redis, logger, metrics });
  const course = createCourseService({ db, cache, publicUrl: config.PUBLIC_URL });
  const leaderboard = createLeaderboardService({ db, redis, logger, metrics, clock });
  const progress = createProgressService({ db, course, leaderboard, clock });
  const users = createUsersService({ db, clock });

  const windowMs = config.RATE_LIMIT_WINDOW_MS;
  const signedIn = [
    requireUser(deps.verifyToken, (clerkUserId) => users.resolve(clerkUserId)),
    rateLimit<AuthedEnv>({
      redis,
      metrics,
      name: 'user',
      limit: config.RATE_LIMIT_USER_MAX,
      windowMs,
      identify: (c) => c.var.user.id,
    }),
  ];

  const app = createRouter<AppEnv>();
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'A Clerk session token (getToken() in the app).',
  });

  // Order matters: shed overload first (cheapest possible), identify and observe, protect, route.
  app.use(loadShed(config.MAX_IN_FLIGHT, metrics));
  app.use(requestId({ headerName: 'X-Request-Id' }));
  app.use(async (c, next) => {
    c.set('log', logger.child({ requestId: c.var.requestId }));
    await next();
  });
  app.use(observe(metrics, state));
  // Nothing is cacheable unless a route says so (the public course, media). With
  // Railway's CDN in front, a signed-in response must never be stored and served
  // to someone else, and the CDN would otherwise apply its default TTL.
  app.use(async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });
  app.use(timing({ enabled: config.NODE_ENV !== 'production' }));
  // Cross-origin resource policy allows other origins: lesson videos are embedded by the
  // web client, and nothing here is readable without a Bearer token anyway.
  app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Idempotency-Key',
        'If-None-Match',
        'X-Request-Id',
      ],
      exposeHeaders: [
        'X-Request-Id',
        'ETag',
        'Retry-After',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Idempotent-Replayed',
      ],
      maxAge: 600,
    }),
  );
  app.use(
    bodyLimit({
      maxSize: 100 * 1024,
      onError: (c) =>
        errorResponse(
          c as Context<AppEnv>,
          new AppError('PAYLOAD_TOO_LARGE', 'Request body is larger than 100 KB'),
        ),
    }),
  );
  app.use('/v1/*', timeout(config.REQUEST_TIMEOUT_MS));
  app.use(
    '/v1/*',
    rateLimit<AppEnv>({
      redis,
      metrics,
      name: 'ip',
      limit: config.RATE_LIMIT_MAX,
      windowMs,
      identify: (c) => clientIp(c, config.TRUST_PROXY),
    }),
  );

  app.route('/', systemRoutes(deps));
  app.route('/health', healthRoutes(deps));
  app.route('/v1', courseRoutes(course));
  app.route('/v1/me', meRoutes({ users, progress }, signedIn));
  app.route('/v1/leaderboard', leaderboardRoutes(leaderboard, signedIn));
  app.route('/webhooks', clerkWebhookRoutes(users, config.CLERK_WEBHOOK_SIGNING_SECRET));
  app.route('/media', mediaRoutes(deps.media));

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Octolearn API',
      version: config.RELEASE,
      description:
        'Course content, learner progress and the weekly leaderboard. Successful responses are `{ "data": … }`; failures are `{ "error": { "code", "message", "details"?, "requestId" } }`.',
    },
  });
  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Octolearn API' }));

  app.notFound(notFound);
  app.onError(createErrorHandler(logger));
  return app;
}
