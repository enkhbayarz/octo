/**
 * Sends the outbox to the API and pulls the account's progress back.
 *
 * - One run at a time; calls made during a run are folded into one re-run.
 * - Operations go strictly in order (the server unlocks lessons in order).
 * - A rejected operation (4xx: the server says it can never succeed) is
 *   dropped; a transient failure (offline, 5xx, 429) stops the run and
 *   retries later with exponential backoff and jitter. Quiz attempts carry an
 *   Idempotency-Key, so a retry after a lost response never counts twice.
 * - Only once everything is sent is the server's view pulled and merged.
 */
import { ApiError, type Api, type ServerProfile, type ServerProgress } from './api';
import type { SyncOp } from './outbox';
import type { SyncStatus } from './store';

export type EngineDeps = {
  api: Api;
  /** Snapshot of the sync store. */
  state: () => { accountId: string | null; planned: boolean; queue: readonly SyncOp[] };
  remove: (op: SyncOp) => void;
  /** Guest progress to upload on first sync after signing in. */
  plan: (server: ServerProgress, profile: ServerProfile) => SyncOp[];
  prepend: (ops: SyncOp[]) => void;
  markPlanned: () => void;
  apply: (server: ServerProgress, profile: ServerProfile) => void;
  markSynced: () => void;
  setStatus: (status: SyncStatus) => void;
  isOnline: () => boolean;
  /** Injected for tests. */
  random?: () => number;
};

function send(api: Api, op: SyncOp): Promise<unknown> {
  switch (op.kind) {
    case 'profile':
      return api.updateProfile({
        displayName: op.displayName,
        timezone: op.timezone,
        onboarding: op.onboarding,
      });
    case 'lesson':
      return api.completeLesson(op.lessonId);
    case 'quiz':
      return api.submitQuizAttempt(op.quizId, op.answers, op.key);
    case 'video':
      return api.saveVideoProgress(op.lessonId, op.positionSec, op.furthestSec);
  }
}

export function createSyncEngine(deps: EngineDeps) {
  const random = deps.random ?? Math.random;
  let running: Promise<void> | null = null;
  let again = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Next retry: 2s, 4s, 8s … up to 60s, with full jitter so phones don't retry in lockstep. */
  function retryLater() {
    failures++;
    const ceiling = Math.min(60_000, 2_000 * 2 ** (failures - 1));
    schedule(Math.round(ceiling / 2 + (random() * ceiling) / 2));
  }

  async function pull() {
    return Promise.all([deps.api.getProgress(), deps.api.getProfile()]);
  }

  async function run(): Promise<void> {
    if (!deps.state().accountId) return;
    if (!deps.isOnline()) {
      deps.setStatus('offline');
      return;
    }
    deps.setStatus('syncing');
    try {
      if (!deps.state().planned) {
        const [server, profile] = await pull();
        deps.prepend(deps.plan(server, profile));
        deps.markPlanned();
      }

      for (let op = deps.state().queue[0]; op; op = deps.state().queue[0]) {
        try {
          await send(deps.api, op);
        } catch (error) {
          if (error instanceof ApiError && !error.retryable) {
            // e.g. ITEM_LOCKED or validation: retrying can't fix it, so it mustn't block the rest.
            console.warn(`sync: dropped ${op.kind} (${error.code})`);
          } else {
            throw error;
          }
        }
        deps.remove(op);
      }

      const [server, profile] = await pull();
      // Only apply when nothing new was queued meanwhile; otherwise the next run will.
      if (deps.state().queue.length === 0) {
        deps.apply(server, profile);
        deps.markSynced();
      } else {
        schedule();
      }
      failures = 0;
      deps.setStatus('idle');
    } catch (error) {
      const offline = error instanceof ApiError && error.status === 0;
      deps.setStatus(offline ? 'offline' : 'failed');
      if (!(error instanceof ApiError)) console.warn('sync failed', error);
      retryLater();
    }
  }

  /** Starts a run now, or right after the current one. */
  function sync(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await run();
      } while (again && deps.state().accountId);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  /** Coalesces bursts (several changes in a row) into one run. */
  function schedule(delayMs = 1_500) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void sync();
    }, delayMs);
  }

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    failures = 0;
  }

  return { sync, schedule, cancel };
}
