import { useAuth } from '@clerk/expo';
import { getCalendars } from 'expo-localization';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { pathItems } from '@/course';
import { useIsOffline } from '@/hooks/use-is-offline';
import { apiUrl } from '@/lib/config';
import { createId } from '@/lib/id';
import { useProgress } from '@/progress/store';

import { createApi } from './api';
import { createSyncEngine } from './engine';
import { planUpload } from './merge';
import { useSync } from './store';

let getToken: () => Promise<string | null> = async () => null;
let online = true;

export function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? 'UTC';
}

/** One engine for the app, wired to the real stores and the Railway API. */
export const syncEngine = createSyncEngine({
  api: createApi(apiUrl, () => getToken()),
  state: () => useSync.getState(),
  remove: (op) => useSync.getState().remove(op),
  plan: (server, profile) =>
    planUpload(useProgress.getState(), server, profile, pathItems, deviceTimeZone(), createId),
  prepend: (ops) => useSync.getState().prepend(ops),
  markPlanned: () => useSync.getState().markPlanned(),
  apply: (server, profile) => useProgress.getState().applyServer(server, profile),
  markSynced: () => useSync.getState().markSynced(),
  setStatus: (status) => useSync.getState().setStatus(status),
  isOnline: () => online,
});

const subscribeToHydration = (onChange: () => void) => useSync.persist.onFinishHydration(onChange);

/** True once the outbox has been read from disk. */
export function useSyncHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, () => useSync.persist.hasHydrated());
}

/**
 * Runs sync at the right moments: signing in, a change being made, the
 * connection coming back, the app returning to the foreground.
 */
export function SyncBridge() {
  const { isLoaded, isSignedIn, userId, getToken: clerkGetToken } = useAuth();
  const offline = useIsOffline();
  const queued = useSync((state) => state.queue.length);

  useEffect(() => {
    getToken = () => clerkGetToken();
  }, [clerkGetToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    const sync = useSync.getState();
    if (sync.accountId !== userId) {
      // This phone's progress belonged to another account: don't merge it into this one.
      if (sync.accountId) useProgress.getState().reset();
      sync.link(userId);
    }
    void syncEngine.sync();
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    online = !offline;
    if (!offline) void syncEngine.sync();
  }, [offline]);

  useEffect(() => {
    if (queued > 0) syncEngine.schedule();
  }, [queued]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncEngine.sync();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
