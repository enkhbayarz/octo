import { randomUUID } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import { newClerkId, sessionToken, startTestApp } from '../helpers/harness.js';
import { completeLessons } from '../helpers/learning.js';

describe('rate limiting', () => {
  test('per client IP across the API, with standard headers', async () => {
    const app = await startTestApp({ RATE_LIMIT_MAX: '3', TRUST_PROXY: 'true' });
    try {
      const ip = `203.0.113.${Math.floor(Math.random() * 200)}`;
      const asClient = (address: string) =>
        app.call('/v1/courses', { headers: { 'X-Real-IP': address } });

      const allowed = [await asClient(ip), await asClient(ip), await asClient(ip)];
      expect(allowed.map((reply) => reply.status)).toEqual([200, 200, 200]);
      expect(allowed[2]!.headers.get('ratelimit-remaining')).toBe('0');

      const limited = await asClient(ip);
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(limited.headers.get('ratelimit-limit')).toBe('3');

      // Someone else is unaffected.
      expect((await asClient(`198.51.100.${Math.floor(Math.random() * 200)}`)).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('behind a proxy, the address the proxy appended wins over a spoofed one', async () => {
    const app = await startTestApp({ RATE_LIMIT_MAX: '1', TRUST_PROXY: 'true' });
    try {
      const real = `192.0.2.${Math.floor(Math.random() * 200)}`;
      const call = (spoofed: string) =>
        app.call('/v1/courses', { headers: { 'X-Forwarded-For': `${spoofed}, ${real}` } });
      expect((await call('1.1.1.1')).status).toBe(200);
      expect((await call('8.8.8.8')).status).toBe(429);
    } finally {
      await app.close();
    }
  });

  test('trusting the proxy but receiving no proxy headers falls back to the socket address', async () => {
    const app = await startTestApp({ RATE_LIMIT_MAX: '1', TRUST_PROXY: 'true' });
    try {
      await app.call('/v1/courses');
      const second = await app.call('/v1/courses');
      expect(second.status).toBe(429);
      expect(second.headers.get('ratelimit-limit')).toBe('1');
    } finally {
      await app.close();
    }
  });

  test('per signed-in learner on /v1/me', async () => {
    const app = await startTestApp({ RATE_LIMIT_USER_MAX: '2' });
    try {
      const { token } = await app.newLearner(); // 1st request
      expect((await app.call('/v1/me/progress', { token })).status).toBe(200); // 2nd
      expect((await app.call('/v1/me/progress', { token })).status).toBe(429); // 3rd
      // Another learner has their own budget.
      const other = await app.newLearner();
      expect((await app.call('/v1/me/progress', { token: other.token })).status).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('backpressure', () => {
  test('past MAX_IN_FLIGHT the server sheds load with 503 instead of queueing', async () => {
    const app = await startTestApp({ MAX_IN_FLIGHT: '2' });
    try {
      const { token } = await app.newLearner();
      const replies = await Promise.all(
        Array.from({ length: 30 }, () => app.call('/v1/me/progress', { token })),
      );
      const shed = replies.filter((reply) => reply.status === 503);
      expect(replies.some((reply) => reply.status === 200)).toBe(true);
      expect(shed.length).toBeGreaterThan(0);
      expect(shed[0]!.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(shed[0]!.headers.get('retry-after')).toBe('1');
      expect(shed[0]!.body.error.requestId).toBe(shed[0]!.headers.get('x-request-id'));
      // Health checks are never shed.
      expect((await app.call('/health/live')).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('a request over the time budget gets 504 instead of hanging', async () => {
    const app = await startTestApp({ REQUEST_TIMEOUT_MS: '1' });
    try {
      const { body, status } = await app.call('/v1/me/progress', {
        token: await sessionToken(newClerkId()),
      });
      expect(status).toBe(504);
      expect(body.error.code).toBe('TIMEOUT');
    } finally {
      await app.close();
    }
  });
});

describe('Redis outage: degrade, never fail', () => {
  test('readiness reports "degraded" but stays up; learning keeps working', async () => {
    const app = await startTestApp({ REDIS_URL: 'redis://127.0.0.1:1', RATE_LIMIT_MAX: '1' });
    try {
      const ready = await app.call('/health/ready');
      expect(ready.status).toBe(200);
      expect(ready.body.data).toMatchObject({
        status: 'degraded',
        checks: { redis: { status: 'down' } },
      });

      // Rate limiter fails open (limit is 1, yet several requests pass), progress is written.
      const { token } = await app.newLearner();
      await completeLessons(app, token, ['u1-l1', 'u1-l2']);
      expect((await app.call('/v1/me', { token })).body.data.xp).toBe(20);
    } finally {
      await app.close();
    }
  });
});

describe('lock contention', () => {
  test('a write blocked on a locked row gives up after lock_timeout with a retryable 503', async () => {
    const app = await startTestApp();
    const holder = await app.deps.pool.connect();
    try {
      const learner = await app.newLearner();
      await holder.query('begin');
      await holder.query('select 1 from users where id = $1 for update', [learner.id]);

      const started = performance.now();
      const { status, body, headers } = await app.call('/v1/me/lessons/u1-l1/complete', {
        method: 'POST',
        token: learner.token,
      });
      expect(status).toBe(503);
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(headers.get('retry-after')).toBe('1');
      expect(performance.now() - started).toBeLessThan(6_000);
    } finally {
      await holder.query('rollback');
      holder.release();
      await app.close();
    }
  });
});

describe('Postgres outage', () => {
  test('readiness fails so the platform stops routing here', async () => {
    const app = await startTestApp();
    try {
      await app.deps.pool.end();
      const { status, body } = await app.call('/health/ready');
      expect(status).toBe(503);
      expect(body.error.details.database.status).toBe('down');
    } finally {
      await app.close();
    }
  });
});

describe('graceful shutdown', () => {
  test('in-flight requests finish, then the server stops accepting and fails readiness', async () => {
    const app = await startTestApp();
    const { token } = await app.newLearner();

    const inFlight = app.call('/v1/me/progress', {
      token,
      headers: { 'X-Request-Id': randomUUID() },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(app.deps.state.shuttingDown).toBe(false);
    const stopping = app.close();
    expect(app.deps.state.shuttingDown).toBe(true);

    const reply = await inFlight;
    expect(reply.status).toBe(200);
    await stopping;

    await expect(fetch(`${app.url}/health/live`)).rejects.toThrow();
    expect(app.deps.pool.ended).toBe(true);
  });

  test('readiness turns 503 as soon as draining starts', async () => {
    const app = await startTestApp();
    try {
      app.deps.state.shuttingDown = true;
      const { status, body } = await app.call('/health/ready');
      expect(status).toBe(503);
      expect(body.error.message).toBe('Shutting down');
    } finally {
      app.deps.state.shuttingDown = false;
      await app.close();
    }
  });
});
