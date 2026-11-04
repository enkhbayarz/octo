/**
 * The outbox: changes made on this phone that the server hasn't seen yet.
 * The app writes locally first (it works offline), then appends here; the
 * sync engine sends the queue in order. Pure functions, so they're tested
 * without storage or network.
 */
import type { OnboardingAnswers } from '@/progress/types';

export type SyncOp =
  | { kind: 'profile'; displayName?: string; timezone?: string; onboarding?: OnboardingAnswers }
  | { kind: 'lesson'; lessonId: string }
  | { kind: 'quiz'; quizId: string; answers: number[]; key: string }
  | { kind: 'video'; lessonId: string; positionSec: number; furthestSec: number };

/**
 * Adds an operation, collapsing ones where only the latest matters:
 * - profile edits merge into one pending update;
 * - a lesson is completed once;
 * - a video keeps only its newest position (furthest never moves back).
 * Order between kinds is kept: the server unlocks items in path order.
 */
export function enqueue(queue: readonly SyncOp[], op: SyncOp): SyncOp[] {
  switch (op.kind) {
    case 'profile': {
      const index = queue.findIndex((item) => item.kind === 'profile');
      if (index < 0) return [...queue, op];
      return queue.map((item, i) => (i === index ? { ...item, ...op } : item));
    }
    case 'lesson':
      return queue.some((item) => item.kind === 'lesson' && item.lessonId === op.lessonId)
        ? [...queue]
        : [...queue, op];
    case 'video': {
      const index = queue.findIndex(
        (item) => item.kind === 'video' && item.lessonId === op.lessonId,
      );
      if (index < 0) return [...queue, op];
      return queue.map((item, i) =>
        i === index && item.kind === 'video'
          ? { ...op, furthestSec: Math.max(item.furthestSec, op.furthestSec) }
          : item,
      );
    }
    case 'quiz':
      return [...queue, op];
  }
}
