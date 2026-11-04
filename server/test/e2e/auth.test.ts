import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { users } from '../../src/db/schema/index.js';
import { newClerkId, sessionToken, startTestApp, type TestApp } from '../helpers/harness.js';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.close());

describe('authentication', () => {
  test('no token → 401 with WWW-Authenticate', async () => {
    const { status, body, headers } = await app.call('/v1/me');
    expect(status).toBe(401);
    expect(headers.get('www-authenticate')).toBe('Bearer');
    expect(body.error).toMatchObject({
      code: 'UNAUTHORIZED',
      message: expect.stringContaining('Sign in'),
    });
  });

  test('a token signed by anyone but Clerk is rejected', async () => {
    const forged = await sessionToken(newClerkId(), { foreignKey: true });
    const { status, body } = await app.call('/v1/me', { token: forged });
    expect(status).toBe(401);
    expect(body.error.message).toBe('Session token is invalid or expired');
  });

  test('an expired token is rejected', async () => {
    const expired = await sessionToken(newClerkId(), { expiresInSec: -60 });
    expect((await app.call('/v1/me', { token: expired })).status).toBe(401);
  });

  test('garbage is rejected', async () => {
    expect((await app.call('/v1/me', { token: 'not.a.jwt' })).status).toBe(401);
    expect((await app.call('/v1/me', { headers: { authorization: 'Basic abc' } })).status).toBe(
      401,
    );
  });

  test('a valid token creates the learner on first use, then reuses it', async () => {
    const clerkId = newClerkId();
    const token = await sessionToken(clerkId);
    const first = await app.call('/v1/me', { token });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ role: 'learner', xp: 0, streak: 0, displayName: null });
    const second = await app.call('/v1/me', { token });
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  test('10 simultaneous first requests still create exactly one learner', async () => {
    const clerkId = newClerkId();
    const token = await sessionToken(clerkId);
    const replies = await Promise.all(
      Array.from({ length: 10 }, () => app.call('/v1/me', { token })),
    );
    expect(replies.map((reply) => reply.status)).toEqual(Array(10).fill(200));
    expect(new Set(replies.map((reply) => reply.body.data.id)).size).toBe(1);
    const rows = await app.deps.db.select().from(users).where(eq(users.clerkUserId, clerkId));
    expect(rows).toHaveLength(1);
  });

  test('checks the authorized party when configured', async () => {
    const strict = await startTestApp({ CLERK_AUTHORIZED_PARTIES: 'https://app.octolearn.test' });
    try {
      const clerkId = newClerkId();
      const good = await sessionToken(clerkId, { azp: 'https://app.octolearn.test' });
      const bad = await sessionToken(clerkId, { azp: 'https://phishing.test' });
      expect((await strict.call('/v1/me', { token: good })).status).toBe(200);
      expect((await strict.call('/v1/me', { token: bad })).status).toBe(401);
    } finally {
      await strict.close();
    }
  });

  test('the leaderboard is behind auth too', async () => {
    expect((await app.call('/v1/leaderboard/weekly')).status).toBe(401);
  });
});
