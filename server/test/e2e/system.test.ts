import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { METRICS_TOKEN, startTestApp, type TestApp, WEB_ORIGIN } from '../helpers/harness.js';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.close());

describe('health', () => {
  test('liveness needs nothing but the process', async () => {
    const { status, body } = await app.call('/health/live');
    expect(status).toBe(200);
    expect(body).toEqual({ data: { status: 'ok' } });
  });

  test('readiness checks Postgres and Redis', async () => {
    const { status, body } = await app.call('/health/ready');
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'ok' }, redis: { status: 'ok' } },
    });
  });
});

describe('responses', () => {
  test('every response carries a request id, echoing a valid incoming one', async () => {
    const generated = await app.call('/health/live');
    expect(generated.headers.get('x-request-id')).toMatch(/^[\w-]{20,}$/);
    const echoed = await app.call('/health/live', { headers: { 'X-Request-Id': 'trace-abc-123' } });
    expect(echoed.headers.get('x-request-id')).toBe('trace-abc-123');
  });

  test('unknown routes get the error envelope with the request id', async () => {
    const { status, body, headers } = await app.call('/v1/does-not-exist');
    expect(status).toBe(404);
    expect(body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'No route for GET /v1/does-not-exist',
        requestId: headers.get('x-request-id'),
      },
    });
  });

  test('security headers are set', async () => {
    const { headers } = await app.call('/health/live');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(headers.get('strict-transport-security')).toContain('max-age');
  });

  test('Server-Timing reports how long the request took', async () => {
    const { headers } = await app.call('/v1/courses');
    expect(headers.get('server-timing')).toMatch(/total;dur=[\d.]+/);
  });
});

describe('binding', () => {
  test('listens on IPv6 too (Railway private networking is IPv6)', async () => {
    const v6 = await startTestApp({ HOST: '::1' });
    try {
      expect(v6.url).toMatch(/^http:\/\/\[::1\]:\d+$/);
      expect((await v6.call('/health/live')).status).toBe(200);
    } finally {
      await v6.close();
    }
  });
});

describe('caching (CDN-safe)', () => {
  test('nothing is cacheable unless the route says so', async () => {
    const { newLearner } = app;
    const { token } = await newLearner();
    for (const path of ['/v1/me', '/v1/me/progress', '/v1/leaderboard/weekly']) {
      const { headers } = await app.call(path, { token });
      expect(headers.get('cache-control')).toBe('no-store');
    }
    expect((await app.call('/v1/me')).headers.get('cache-control')).toBe('no-store'); // errors too
    expect((await app.call('/health/ready')).headers.get('cache-control')).toBe('no-store');
    expect((await app.call('/v1/courses/english-a1')).headers.get('cache-control')).toContain(
      'public',
    );
  });
});

describe('CORS', () => {
  test('allows the configured web origin, including preflight', async () => {
    const preflight = await app.call('/v1/me', {
      method: 'OPTIONS',
      headers: {
        Origin: WEB_ORIGIN,
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'authorization',
    );

    const simple = await app.call('/v1/courses', { headers: { Origin: WEB_ORIGIN } });
    expect(simple.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(simple.headers.get('access-control-expose-headers')).toContain('X-Request-Id');
  });

  test('gives other origins no CORS headers', async () => {
    const { headers } = await app.call('/v1/courses', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('metrics and stats', () => {
  test('need the metrics token', async () => {
    expect((await app.call('/metrics')).status).toBe(401);
    expect((await app.call('/internal/stats', { token: 'wrong-token-wrong-token' })).status).toBe(
      401,
    );
  });

  test('Prometheus metrics include request latency by route, pool and process stats', async () => {
    await app.call('/v1/courses/english-a1');
    const { status, body } = await app.call<string>('/metrics', { token: METRICS_TOKEN });
    expect(status).toBe(200);
    expect(body).toContain('http_request_duration_seconds_bucket');
    expect(body).toMatch(/route="\/v1\/courses\/:courseId"/);
    expect(body).toMatch(/db_pool_connections\{state="idle"\}/);
    expect(body).toContain('process_cpu_seconds_total');
    expect(body).toContain('nodejs_eventloop_lag_seconds');
  });

  test('stats show CPU, memory, event loop and pool usage', async () => {
    const { status, body } = await app.call('/internal/stats', { token: METRICS_TOKEN });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      cpu: { percent: expect.any(Number), cores: expect.any(Number) },
      memory: { rssMb: expect.any(Number), heapUsedMb: expect.any(Number) },
      eventLoop: { delayP99Ms: expect.any(Number), utilization: expect.any(Number) },
      databasePool: { max: 10, waiting: 0 },
      http: { inFlight: 1 },
    });
  });

  test('are open in development when no token is configured', async () => {
    const dev = await startTestApp({ NODE_ENV: 'development', METRICS_TOKEN: '' });
    try {
      expect((await dev.call('/internal/stats')).status).toBe(200);
    } finally {
      await dev.close();
    }
  });

  test('are hidden in production when no token is configured', async () => {
    const prod = await startTestApp({ NODE_ENV: 'production', METRICS_TOKEN: '' });
    try {
      expect((await prod.call('/metrics')).status).toBe(404);
    } finally {
      await prod.close();
    }
  });
});

describe('API docs', () => {
  test('serves an OpenAPI 3.1 document covering every route', async () => {
    const { status, body } = await app.call('/openapi.json');
    expect(status).toBe(200);
    expect(body.openapi).toBe('3.1.0');
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        '/v1/courses',
        '/v1/courses/{courseId}',
        '/v1/me',
        '/v1/me/progress',
        '/v1/me/lessons/{lessonId}/complete',
        '/v1/me/lessons/{lessonId}/video-progress',
        '/v1/me/quizzes/{quizId}/attempts',
        '/v1/leaderboard/weekly',
        '/webhooks/clerk',
        '/health/ready',
      ]),
    );
    expect(body.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  test('serves the interactive reference at /docs', async () => {
    const { status, body } = await app.call<string>('/docs');
    expect(status).toBe(200);
    expect(body).toContain('/openapi.json');
  });

  test('the root describes the service', async () => {
    const { body } = await app.call('/');
    expect(body.data).toMatchObject({ name: 'octolearn-api', docs: '/docs' });
  });
});
