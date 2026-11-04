import { beforeEach, describe, expect, mock, test } from 'bun:test';

const disk = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => void disk.set(key, value),
    removeItem: async (key: string) => void disk.delete(key),
  },
}));

const { useSync } = await import('./store');
const sync = () => useSync.getState();

beforeEach(() => sync().unlink());

describe('sync store', () => {
  test('guests queue nothing', () => {
    sync().enqueue({ kind: 'lesson', lessonId: 'u1-l1' });
    expect(sync().queue).toEqual([]);
  });

  test('linking an account starts a fresh, unplanned outbox', () => {
    sync().link('user_1');
    sync().enqueue({ kind: 'lesson', lessonId: 'u1-l1' });
    expect(sync()).toMatchObject({
      accountId: 'user_1',
      planned: false,
      queue: [{ kind: 'lesson', lessonId: 'u1-l1' }],
    });
    sync().link('user_2');
    expect(sync().queue).toEqual([]);
  });

  test('guest progress goes first and replaces duplicates queued since', () => {
    sync().link('user_1');
    sync().enqueue({ kind: 'lesson', lessonId: 'u1-l2' });
    sync().enqueue({ kind: 'lesson', lessonId: 'u1-l3' });
    sync().prepend([
      { kind: 'lesson', lessonId: 'u1-l1' },
      { kind: 'lesson', lessonId: 'u1-l2' },
    ]);
    expect(sync().queue.map((op) => op.kind === 'lesson' && op.lessonId)).toEqual([
      'u1-l1',
      'u1-l2',
      'u1-l3',
    ]);
  });

  test('removes exactly the operation that was sent', () => {
    sync().link('user_1');
    sync().enqueue({ kind: 'profile', displayName: 'Old' });
    const sent = sync().queue[0]!;
    sync().enqueue({ kind: 'profile', displayName: 'New' }); // updated while in flight
    sync().remove(sent);
    expect(sync().queue).toEqual([{ kind: 'profile', displayName: 'New' }]);
  });

  test('tracks planning, sync time and status; sign-out forgets everything', () => {
    sync().link('user_1');
    sync().markPlanned();
    sync().markSynced();
    sync().setStatus('syncing');
    expect(sync()).toMatchObject({
      planned: true,
      lastSyncedAt: expect.any(Number),
      status: 'syncing',
    });
    sync().unlink();
    expect(sync()).toMatchObject({
      accountId: null,
      planned: false,
      queue: [],
      lastSyncedAt: null,
      status: 'idle',
    });
  });

  test('persists the outbox but not the live status', () => {
    sync().link('user_1');
    sync().setStatus('syncing');
    const persisted = useSync.persist.getOptions().partialize?.(sync());
    expect(persisted).toEqual({
      accountId: 'user_1',
      planned: false,
      queue: [],
      lastSyncedAt: null,
    });
  });
});
