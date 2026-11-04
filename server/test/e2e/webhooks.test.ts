import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { lessonCompletions, users } from '../../src/db/schema/index.js';
import { newClerkId, signWebhook, startTestApp, type TestApp } from '../helpers/harness.js';
import { completeLessons } from '../helpers/learning.js';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.close());

const clerkUser = (id: string, updatedAt: number, overrides: Record<string, unknown> = {}) => ({
  object: 'user',
  id,
  first_name: 'Номин',
  last_name: null,
  username: null,
  image_url: 'https://img.clerk.com/avatar.png',
  primary_email_address_id: 'idn_1',
  email_addresses: [{ id: 'idn_1', email_address: 'nomin@example.com' }],
  created_at: updatedAt,
  updated_at: updatedAt,
  ...overrides,
});

const send = (type: string, data: unknown, at?: Date) => {
  const { body, headers } = signWebhook({ type, object: 'event', data }, at);
  return app.call('/webhooks/clerk', { method: 'POST', headers, body });
};

const row = async (clerkId: string) =>
  (await app.deps.db.select().from(users).where(eq(users.clerkUserId, clerkId)))[0];

describe('POST /webhooks/clerk', () => {
  test('rejects unsigned, tampered and stale deliveries', async () => {
    const unsigned = await app.call('/webhooks/clerk', {
      method: 'POST',
      json: { type: 'user.deleted', data: {} },
    });
    expect(unsigned.status).toBe(400);

    const signed = signWebhook({ type: 'user.deleted', data: { id: 'user_x' } });
    const tampered = await app.call('/webhooks/clerk', {
      method: 'POST',
      headers: signed.headers,
      body: signed.body.replace('user_x', 'user_y'),
    });
    expect(tampered.status).toBe(400);
    expect(tampered.body.error.message).toBe('Invalid webhook signature');

    // A captured request replayed an hour later is outside the signature's time window.
    const stale = await send(
      'user.deleted',
      { id: 'user_x' },
      new Date(Date.now() - 60 * 60 * 1000),
    );
    expect(stale.status).toBe(400);
  });

  test('user.created stores email, avatar and a starting name', async () => {
    const clerkId = newClerkId();
    const { status, body } = await send('user.created', clerkUser(clerkId, 1_000));
    expect(status).toBe(200);
    expect(body).toEqual({ data: { received: true } });
    expect(await row(clerkId)).toMatchObject({
      email: 'nomin@example.com',
      imageUrl: 'https://img.clerk.com/avatar.png',
      displayName: 'Номин',
    });
  });

  test('applies updates in order, skips out-of-order ones, and keeps the in-app name', async () => {
    const clerkId = newClerkId();
    await send('user.created', clerkUser(clerkId, 1_000));
    await app.deps.db
      .update(users)
      .set({ displayName: 'Nomi' })
      .where(eq(users.clerkUserId, clerkId));

    const newer = clerkUser(clerkId, 3_000, {
      email_addresses: [{ id: 'idn_1', email_address: 'new@example.com' }],
    });
    const older = clerkUser(clerkId, 2_000, {
      email_addresses: [{ id: 'idn_1', email_address: 'old@example.com' }],
    });
    await send('user.updated', newer);
    await send('user.updated', older); // delivered late
    await send('user.updated', newer); // delivered twice

    expect(await row(clerkId)).toMatchObject({ email: 'new@example.com', displayName: 'Nomi' });
  });

  test('user.deleted removes the learner and, by cascade, their progress', async () => {
    const learner = await app.newLearner();
    await completeLessons(app, learner.token, ['u1-l1']);
    const { status } = await send('user.deleted', {
      id: learner.clerkId,
      object: 'user',
      deleted: true,
    });
    expect(status).toBe(200);
    expect(await row(learner.clerkId)).toBeUndefined();
    const progress = await app.deps.db
      .select()
      .from(lessonCompletions)
      .where(eq(lessonCompletions.userId, learner.id));
    expect(progress).toEqual([]);
    // Their old session token now resolves to a fresh, empty account.
    expect((await app.call('/v1/me', { token: learner.token })).body.data.xp).toBe(0);
  });

  test('copes with sparse profiles: no primary email, no avatar, username only', async () => {
    const clerkId = newClerkId();
    await send(
      'user.created',
      clerkUser(clerkId, 1_000, {
        first_name: null,
        username: 'nomin_mn',
        image_url: '',
        primary_email_address_id: null,
      }),
    );
    expect(await row(clerkId)).toMatchObject({
      email: null,
      imageUrl: null,
      displayName: 'nomin_mn',
    });
  });

  test('a deletion without a user id is acknowledged and ignored', async () => {
    expect((await send('user.deleted', { object: 'user', deleted: true })).status).toBe(200);
  });

  test('acknowledges events it does not handle', async () => {
    expect((await send('session.created', { id: 'sess_1' })).status).toBe(200);
  });

  test('refuses deliveries while webhooks are not configured', async () => {
    const unconfigured = await startTestApp({ CLERK_WEBHOOK_SIGNING_SECRET: '' });
    try {
      const { body, headers } = signWebhook({ type: 'user.deleted', data: { id: 'x' } });
      const reply = await unconfigured.call('/webhooks/clerk', { method: 'POST', headers, body });
      expect(reply.status).toBe(503);
      expect(reply.headers.get('retry-after')).toBe('1');
    } finally {
      await unconfigured.close();
    }
  });
});
