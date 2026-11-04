import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { startTestApp, type TestApp } from '../helpers/harness.js';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(() => app.close());

describe('PATCH /v1/me', () => {
  test('saves the name (normalized), time zone and onboarding answers', async () => {
    const { token } = await app.newLearner();
    const { status, body } = await app.call('/v1/me', {
      method: 'PATCH',
      token,
      json: {
        displayName: '  Болд   Бат ',
        timezone: 'Europe/Berlin',
        onboarding: { reason: 'travel', level: 'some', dailyMinutes: 10 },
      },
    });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      displayName: 'Болд Бат',
      timezone: 'Europe/Berlin',
      onboarding: { reason: 'travel', level: 'some', dailyMinutes: 10 },
    });
    expect((await app.call('/v1/me', { token })).body.data.displayName).toBe('Болд Бат');
  });

  test('partial updates leave other fields alone', async () => {
    const { token } = await app.newLearner();
    await app.call('/v1/me', { method: 'PATCH', token, json: { displayName: 'Saraa' } });
    const { body } = await app.call('/v1/me', {
      method: 'PATCH',
      token,
      json: { timezone: 'Asia/Tokyo' },
    });
    expect(body.data).toMatchObject({
      displayName: 'Saraa',
      timezone: 'Asia/Tokyo',
      onboarding: null,
    });
  });

  test('reports every invalid field at once', async () => {
    const { token } = await app.newLearner();
    const { status, body } = await app.call('/v1/me', {
      method: 'PATCH',
      token,
      json: {
        displayName: 'x'.repeat(25),
        timezone: 'Moon/Base',
        onboarding: { reason: 'fame', level: 'new', dailyMinutes: 0 },
      },
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.map((detail: any) => detail.path).sort()).toEqual([
      'displayName',
      'onboarding.dailyMinutes',
      'onboarding.reason',
      'timezone',
    ]);
  });

  test('rejects an empty update, unknown fields and blank names', async () => {
    const { token } = await app.newLearner();
    expect((await app.call('/v1/me', { method: 'PATCH', token, json: {} })).status).toBe(400);
    expect(
      (await app.call('/v1/me', { method: 'PATCH', token, json: { role: 'admin' } })).status,
    ).toBe(400);
    expect(
      (await app.call('/v1/me', { method: 'PATCH', token, json: { displayName: '   ' } })).status,
    ).toBe(400);
  });

  test('malformed JSON → 400 BAD_REQUEST, not a 500', async () => {
    const { token } = await app.newLearner();
    const { status, body } = await app.call('/v1/me', {
      method: 'PATCH',
      token,
      headers: { 'content-type': 'application/json' },
      body: '{"displayName": ',
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  test('bodies over 100 KB → 413', async () => {
    const { token } = await app.newLearner();
    const { status, body } = await app.call('/v1/me', {
      method: 'PATCH',
      token,
      json: { displayName: 'x'.repeat(150 * 1024) },
    });
    expect(status).toBe(413);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
