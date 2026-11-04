import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { enqueue, type SyncOp } from './outbox';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'failed';

type SyncState = {
  /** The Clerk user this phone's progress belongs to; null for a guest. */
  accountId: string | null;
  /** Guest progress has been compared with the account and uploaded. */
  planned: boolean;
  queue: SyncOp[];
  lastSyncedAt: number | null;
  /** Not persisted: what the engine is doing right now. */
  status: SyncStatus;

  /** Records a change for the account. Guests have nothing to sync, so it's a no-op for them. */
  enqueue: (op: SyncOp) => void;
  /** Puts guest progress first: it unlocks whatever was queued after it. */
  prepend: (ops: SyncOp[]) => void;
  /** Removes a sent operation, unless it was updated meanwhile (then the newer version still has to go). */
  remove: (op: SyncOp) => void;
  link: (accountId: string) => void;
  markPlanned: () => void;
  markSynced: () => void;
  setStatus: (status: SyncStatus) => void;
  /** Sign-out: forget the account and anything unsent. */
  unlink: () => void;
};

export const useSync = create<SyncState>()(
  persist(
    (set, get) => ({
      accountId: null,
      planned: false,
      queue: [],
      lastSyncedAt: null,
      status: 'idle',

      enqueue: (op) => {
        if (get().accountId) set({ queue: enqueue(get().queue, op) });
      },
      prepend: (ops) =>
        set({
          queue: ops
            .reduce(enqueue, [] as SyncOp[])
            .concat(
              get().queue.filter(
                (item) =>
                  !(
                    item.kind === 'lesson' &&
                    ops.some((op) => op.kind === 'lesson' && op.lessonId === item.lessonId)
                  ),
              ),
            ),
        }),
      remove: (op) => set({ queue: get().queue.filter((item) => item !== op) }),
      link: (accountId) => set({ accountId, planned: false, queue: [], lastSyncedAt: null }),
      markPlanned: () => set({ planned: true }),
      markSynced: () => set({ lastSyncedAt: Date.now() }),
      setStatus: (status) => set({ status }),
      unlink: () =>
        set({ accountId: null, planned: false, queue: [], lastSyncedAt: null, status: 'idle' }),
    }),
    {
      name: 'octolearn.sync',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ accountId, planned, queue, lastSyncedAt }) => ({
        accountId,
        planned,
        queue,
        lastSyncedAt,
      }),
    },
  ),
);
