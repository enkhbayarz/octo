import { afterEach, describe, expect, mock, test } from 'bun:test';

import { ApiError, createApi } from './api';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function respond(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return calls;
}

const api = createApi('https://api.test', async () => 'token-123');

describe('api client', () => {
  test('sends the session token and JSON, and unwraps { data }', async () => {
    const calls = respond(201, { data: { attemptId: 'a1' } });
    expect(await api.submitQuizAttempt('u1-quiz', [1, 0], 'key-1')).toEqual({ attemptId: 'a1' });
    const [call] = calls;
    expect(call?.url).toBe('https://api.test/v1/me/quizzes/u1-quiz/attempts');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      authorization: 'Bearer token-123',
      'content-type': 'application/json',
      'idempotency-key': 'key-1',
    });
    expect(call?.init.body).toBe('{"answers":[1,0]}');
  });

  test('every endpoint hits its route', async () => {
    const calls = respond(200, { data: {} });
    await api.getProfile();
    await api.updateProfile({ displayName: 'Болд' });
    await api.getProgress();
    await api.completeLesson('u1-l1');
    await api.saveVideoProgress('u1-l2', 3, 4);
    expect(
      calls.map((call) => `${call.init.method} ${call.url.replace('https://api.test', '')}`),
    ).toEqual([
      'GET /v1/me',
      'PATCH /v1/me',
      'GET /v1/me/progress',
      'POST /v1/me/lessons/u1-l1/complete',
      'PUT /v1/me/lessons/u1-l2/video-progress',
    ]);
    expect(calls[0]?.init.body).toBeUndefined();
  });

  test('turns the error envelope into an ApiError with its code', async () => {
    respond(409, { error: { code: 'ITEM_LOCKED', message: 'Finish the previous lesson' } });
    const error = await api.completeLesson('u1-l3').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'ITEM_LOCKED', retryable: false });
  });

  test('a response that is not JSON still becomes an ApiError', async () => {
    respond(502, '<html>Bad gateway</html>');
    await expect(api.getProgress()).rejects.toMatchObject({
      status: 502,
      code: 'HTTP',
      retryable: true,
    });
  });

  test('no connection → status 0, retryable', async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(api.getProfile()).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
      retryable: true,
    });
  });

  test('a request that hangs is aborted and treated as offline', async () => {
    globalThis.fetch = mock(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    ) as unknown as typeof fetch;
    const impatient = createApi('https://api.test', async () => 'token', 10);
    await expect(impatient.getProgress()).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  test('no session token → 401 without calling the network', async () => {
    const calls = respond(200, { data: {} });
    const signedOut = createApi('https://api.test', async () => null);
    await expect(signedOut.getProfile()).rejects.toMatchObject({ status: 401, retryable: true });
    expect(calls).toEqual([]);
  });

  test('rate limits and server errors are retryable; client errors are not', () => {
    expect(new ApiError(429, 'RATE_LIMITED', '').retryable).toBe(true);
    expect(new ApiError(503, 'SERVICE_UNAVAILABLE', '').retryable).toBe(true);
    expect(new ApiError(400, 'VALIDATION_FAILED', '').retryable).toBe(false);
    expect(new ApiError(422, 'IDEMPOTENCY_KEY_REUSED', '').retryable).toBe(false);
  });
});
