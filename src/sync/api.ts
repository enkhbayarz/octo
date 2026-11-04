/**
 * The few Octolearn API calls the app makes, typed to match `server/` (see
 * its /docs). Every response is `{ data }` or `{ error: { code, message } }`.
 */
import type { EnglishLevel, LearningReason, OnboardingAnswers } from '@/progress/types';

export type ServerProfile = {
  id: string;
  displayName: string | null;
  email: string | null;
  timezone: string;
  onboarding: { reason: LearningReason; level: EnglishLevel; dailyMinutes: number } | null;
  xp: number;
  streak: number;
};

export type ServerProgress = {
  xp: number;
  streak: { count: number; lastActiveDay: string | null };
  completedLessons: string[];
  quizResults: Record<string, { best: number; total: number; passed: boolean; attempts: number }>;
  videoProgress: Record<string, { positionSec: number; furthestSec: number }>;
  activity: { day: string; xp: number }[];
};

export type ProfileUpdate = {
  displayName?: string;
  timezone?: string;
  onboarding?: OnboardingAnswers;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Worth trying again later: the network, rate limits, the server having a moment. */
  get retryable() {
    return this.status === 0 || this.status === 401 || this.status === 429 || this.status >= 500;
  }
}

export type Api = ReturnType<typeof createApi>;

/** `getToken` returns a fresh Clerk session token (Clerk refreshes it as needed). */
export function createApi(
  baseUrl: string,
  getToken: () => Promise<string | null>,
  timeoutMs = 15_000,
) {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) {
    const token = await getToken();
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in');

    const controller = new AbortController();
    // A request that hangs on a bad connection counts as offline, so sync retries later.
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Network request failed');
    } finally {
      clearTimeout(timer);
    }

    const json = (await response.json().catch(() => null)) as
      { data: T } | { error: { code: string; message: string } } | null;
    if (!response.ok || !json || 'error' in json) {
      const error =
        json && 'error' in json ? json.error : { code: 'HTTP', message: response.statusText };
      throw new ApiError(response.status, error.code, error.message);
    }
    return json.data;
  }

  return {
    getProfile: () => request<ServerProfile>('GET', '/v1/me'),
    updateProfile: (update: ProfileUpdate) => request<ServerProfile>('PATCH', '/v1/me', update),
    getProgress: () => request<ServerProgress>('GET', '/v1/me/progress'),
    completeLesson: (lessonId: string) => request('POST', `/v1/me/lessons/${lessonId}/complete`),
    saveVideoProgress: (lessonId: string, positionSec: number, furthestSec: number) =>
      request('PUT', `/v1/me/lessons/${lessonId}/video-progress`, { positionSec, furthestSec }),
    submitQuizAttempt: (quizId: string, answers: number[], idempotencyKey: string) =>
      request(
        'POST',
        `/v1/me/quizzes/${quizId}/attempts`,
        { answers },
        { 'idempotency-key': idempotencyKey },
      ),
  };
}
