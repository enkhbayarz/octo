import { useAuth, useUser } from '@clerk/expo';

import { accountsEnabled } from '@/lib/config';
import { useProgress } from '@/progress/store';

import { useSync } from './store';
import { syncEngine } from './sync-bridge';

export type Account = {
  signedIn: boolean;
  email: string | null;
  firstName: string | null;
  status: ReturnType<typeof useSync.getState>['status'];
  /** Changes made on this phone that the server hasn't received yet. */
  pending: number;
  syncNow: () => void;
  /** Signs out and clears this phone back to a fresh start (progress stays in the account). */
  signOut: () => Promise<void>;
};

function useClerkAccount(): Account {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const status = useSync((state) => state.status);
  const pending = useSync((state) => state.queue.length);
  return {
    signedIn: Boolean(isSignedIn),
    email: user?.primaryEmailAddress?.emailAddress ?? null,
    firstName: user?.firstName ?? null,
    status,
    pending,
    syncNow: () => void syncEngine.sync(),
    signOut: async () => {
      syncEngine.cancel();
      await signOut();
      useSync.getState().unlink();
      useProgress.getState().reset();
    },
  };
}

const guestOnly: Account = {
  signedIn: false,
  email: null,
  firstName: null,
  status: 'idle',
  pending: 0,
  syncNow: () => {},
  signOut: async () => {},
};

/**
 * The learner's account and sync state. Without Clerk configured (`.env`)
 * the app is guest-only; the choice is fixed per build, so hook order never changes.
 */
export const useAccount: () => Account = accountsEnabled ? useClerkAccount : () => guestOnly;
