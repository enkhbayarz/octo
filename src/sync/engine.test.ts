import { describe, expect, test } from 'bun:test';

import { type Api, ApiError, type ServerProfile, type ServerProgress } from './api';
import { createSyncEngine, type EngineDeps } from './engine';
import { enqueue, type SyncOp } from './outbox';
import type { SyncStatus } from './store';

const progress: ServerProgress = {
  xp: 10,
  streak: { count: 1, lastActiveDay: '2026-11-04' },
  completedLessons: ['u1-l1'],
  quizResults: {},
  videoProgress: {},
  activity: [],
};
const profile: ServerProfile = {
  id: 'u',
  displayName: 'Болд',
  email: null,
  timezone: 'Asia/Ulaanbaatar',
  onboarding: null,
  xp: 10,
  streak: 1,
};

/** A fake API that records calls and fails the ones a test tells it to. */
function fakeApi(fail: (call: string) => Error | undefined = () => undefined) {
  const calls: string[] = [];
  const handle = async <T>(call: string, value: T) => {
    calls.push(call);
    const error = fail(call);
    if (error) throw error;
    return value;
  };
  const api = {
    getProfile: () => handle('getProfile', profile),
    updateProfile: (update: object) => handle(`updateProfile ${JSON.stringify(update)}`, profile),
    getProgress: () => handle('getProgress', progress),
    completeLesson: (id: string) => handle(`completeLesson ${id}`, {}),
    saveVideoProgress: (id: string, position: number, furthest: number) =>
      handle(`saveVideoProgress ${id} ${position} ${furthest}`, {}),
    submitQuizAttempt: (id: string, answers: number[], key: string) =>
      handle(`submitQuizAttempt ${id} ${answers.join('')} ${key}`, {}),
  } as unknown as Api;
  return { api, calls };
}

/** A sync store in memory, wired the way the app wires the real one. */
function harness(api: Api, options: { planned?: boolean; online?: boolean; plan?: SyncOp[] } = {}) {
  const store = {
    accountId: 'user_1' as string | null,
    planned: options.planned ?? true,
    queue: [] as SyncOp[],
    statuses: [] as SyncStatus[],
    applied: 0,
    synced: 0,
  };
  const deps: EngineDeps = {
    api,
    state: () => store,
    remove: (op) => (store.queue = store.queue.filter((item) => item !== op)),
    plan: () => options.plan ?? [],
    prepend: (ops) => (store.queue = [...ops, ...store.queue]),
    markPlanned: () => (store.planned = true),
    apply: () => store.applied++,
    markSynced: () => store.synced++,
    setStatus: (status) => store.statuses.push(status),
    isOnline: () => options.online ?? true,
    random: () => 0.5,
  };
  const engine = createSyncEngine(deps);
  const add = (op: SyncOp) => (store.queue = enqueue(store.queue, op));
  return { store, engine, add };
}

describe('sync engine', () => {
  test('sends the queue in order, then pulls and applies the account', async () => {
    const { api, calls } = fakeApi();
    const { store, engine, add } = harness(api);
    add({ kind: 'profile', displayName: 'Болд' });
    add({ kind: 'lesson', lessonId: 'u1-l1' });
    add({ kind: 'quiz', quizId: 'u1-quiz', answers: [1, 0, 2], key: 'k-1' });
    add({ kind: 'video', lessonId: 'u1-l2', positionSec: 3, furthestSec: 4 });

    await engine.sync();

    expect(calls).toEqual([
      'updateProfile {"displayName":"Болд"}',
      'completeLesson u1-l1',
      'submitQuizAttempt u1-quiz 102 k-1',
      'saveVideoProgress u1-l2 3 4',
      'getProgress',
      'getProfile',
    ]);
    expect(store.queue).toEqual([]);
    expect(store).toMatchObject({ applied: 1, synced: 1 });
    expect(store.statuses).toEqual(['syncing', 'idle']);
    engine.cancel();
  });

  test('first sync after sign-in uploads guest progress before anything queued since', async () => {
    const { api, calls } = fakeApi();
    const { engine, add } = harness(api, {
      planned: false,
      plan: [
        { kind: 'lesson', lessonId: 'u1-l1' },
        { kind: 'lesson', lessonId: 'u1-l2' },
      ],
    });
    add({ kind: 'lesson', lessonId: 'u1-l3' });
    await engine.sync();
    expect(calls.filter((call) => call.startsWith('completeLesson'))).toEqual([
      'completeLesson u1-l1',
      'completeLesson u1-l2',
      'completeLesson u1-l3',
    ]);
    engine.cancel();
  });

  test('offline: keeps the queue, reports it, and tries again later', async () => {
    const { api, calls } = fakeApi((call) =>
      call.startsWith('completeLesson') ? new ApiError(0, 'NETWORK', 'down') : undefined,
    );
    const { store, engine, add } = harness(api);
    add({ kind: 'lesson', lessonId: 'u1-l1' });
    add({ kind: 'lesson', lessonId: 'u1-l2' });
    await engine.sync();
    expect(calls).toEqual(['completeLesson u1-l1']); // stopped at the first failure, kept order
    expect(store.queue).toHaveLength(2);
    expect(store.statuses.at(-1)).toBe('offline');
    expect(store.applied).toBe(0);
    engine.cancel();
  });

  test('server errors (5xx) also wait and retry, as "failed"', async () => {
    const { api } = fakeApi((call) =>
      call === 'getProgress' ? new ApiError(503, 'SERVICE_UNAVAILABLE', '') : undefined,
    );
    const { store, engine } = harness(api);
    await engine.sync();
    expect(store.statuses.at(-1)).toBe('failed');
    engine.cancel();
  });

  test('an operation the server rejects for good is dropped so it can’t block the rest', async () => {
    const { api, calls } = fakeApi((call) =>
      call === 'completeLesson u9-l9' ? new ApiError(404, 'NOT_FOUND', 'gone') : undefined,
    );
    const { store, engine, add } = harness(api);
    add({ kind: 'lesson', lessonId: 'u9-l9' });
    add({ kind: 'lesson', lessonId: 'u1-l1' });
    await engine.sync();
    expect(calls.slice(0, 2)).toEqual(['completeLesson u9-l9', 'completeLesson u1-l1']);
    expect(store.queue).toEqual([]);
    engine.cancel();
  });

  test('a retried quiz attempt reuses its idempotency key', async () => {
    let first = true;
    const { api, calls } = fakeApi((call) => {
      if (call.startsWith('submitQuizAttempt') && first) {
        first = false;
        return new ApiError(0, 'NETWORK', 'response lost');
      }
      return undefined;
    });
    const { engine, add } = harness(api);
    add({ kind: 'quiz', quizId: 'u1-quiz', answers: [1], key: 'same-key' });
    await engine.sync();
    await engine.sync();
    expect(calls.filter((call) => call.startsWith('submitQuizAttempt'))).toEqual([
      'submitQuizAttempt u1-quiz 1 same-key',
      'submitQuizAttempt u1-quiz 1 same-key',
    ]);
    engine.cancel();
  });

  test('a change made while its older version is in flight is sent too, not lost', async () => {
    const sent: string[] = [];
    let release: (() => void) | undefined;
    const { api } = fakeApi();
    const slowFirst = {
      ...api,
      updateProfile: (update: { displayName?: string }) => {
        sent.push(update.displayName ?? '');
        if (sent.length > 1) return Promise.resolve(profile);
        return new Promise<ServerProfile>((resolve) => (release = () => resolve(profile)));
      },
    } as unknown as Api;
    const { store, engine, add } = harness(slowFirst);
    add({ kind: 'profile', displayName: 'Old' });
    const running = engine.sync();
    while (!release) await new Promise((resolve) => setTimeout(resolve, 1));

    add({ kind: 'profile', displayName: 'New' }); // merges into the queued entry while "Old" is sent
    release();
    await running;

    expect(sent).toEqual(['Old', 'New']);
    expect(store.queue).toEqual([]);
    engine.cancel();
  });

  test('changes queued during the final pull are sent by a scheduled re-run', async () => {
    let sneak: (() => void) | undefined;
    const { api, calls } = fakeApi((call) => {
      if (call === 'getProgress') sneak?.();
      return undefined;
    });
    const { store, engine, add } = harness(api);
    sneak = () => {
      sneak = undefined;
      add({ kind: 'lesson', lessonId: 'u1-l2' });
    };
    await engine.sync();
    expect(store.applied).toBe(0); // not applied over an unsent change
    await new Promise((resolve) => setTimeout(resolve, 1_600));
    expect(calls).toContain('completeLesson u1-l2');
    expect(store.applied).toBe(1);
    engine.cancel();
  });

  test('a sync requested mid-run folds into one follow-up run', async () => {
    const { api, calls } = fakeApi();
    const { engine, add } = harness(api);
    add({ kind: 'lesson', lessonId: 'u1-l1' });
    const first = engine.sync();
    const second = engine.sync();
    await Promise.all([first, second]);
    expect(calls.filter((call) => call === 'getProgress')).toHaveLength(2);
    engine.cancel();
  });

  test('schedule() coalesces a burst into one run', async () => {
    const { api, calls } = fakeApi();
    const { engine } = harness(api);
    engine.schedule(5);
    engine.schedule(5);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls.filter((call) => call === 'getProgress')).toHaveLength(1);
    engine.cancel();
  });

  test('does nothing for a guest, and reports offline without calling the API', async () => {
    const { api, calls } = fakeApi();
    const guest = harness(api);
    guest.store.accountId = null;
    await guest.engine.sync();
    const offline = harness(api, { online: false });
    offline.add({ kind: 'lesson', lessonId: 'u1-l1' });
    await offline.engine.sync();
    expect(calls).toEqual([]);
    expect(offline.store.statuses).toEqual(['offline']);
  });
});
