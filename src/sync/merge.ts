/**
 * Reconciling this phone with the account. Pure functions over plain data.
 *
 * - `planUpload`: on first sign-in, what the phone knows that the account
 *   doesn't (guest progress), as outbox operations in path order.
 * - `applyServer`: after the outbox is empty, take the account's view:
 *   totals and quiz results from the server, plus anything local it lacks.
 */
import type { PathItem } from '@/course';
import { normalizeName } from '@/progress/rules';
import type { Progress } from '@/progress/types';

import type { ServerProfile, ServerProgress } from './api';
import type { SyncOp } from './outbox';

export function planUpload(
  local: Progress,
  server: ServerProgress,
  profile: ServerProfile,
  path: readonly PathItem[],
  timezone: string,
  createKey: () => string,
): SyncOp[] {
  const ops: SyncOp[] = [];

  const name = normalizeName(local.learnerName);
  const update: Extract<SyncOp, { kind: 'profile' }> = { kind: 'profile' };
  if (profile.timezone !== timezone) update.timezone = timezone;
  if (!profile.displayName && name) update.displayName = name;
  if (!profile.onboarding && local.answers) update.onboarding = local.answers;
  if (Object.keys(update).length > 1) ops.push(update);

  const serverLessons = new Set(server.completedLessons);
  for (const item of path) {
    if (item.kind === 'lesson' && local.completedLessons[item.id] && !serverLessons.has(item.id)) {
      ops.push({ kind: 'lesson', lessonId: item.id });
    }
    // A quiz passed as a guest is replayed with the right answers: its exact
    // choices weren't kept, and the pass is what unlocks the next unit.
    if (
      item.kind === 'quiz' &&
      local.quizResults[item.id]?.passed &&
      !server.quizResults[item.id]?.passed
    ) {
      ops.push({
        kind: 'quiz',
        quizId: item.id,
        answers: item.quiz.questions.map((question) => question.answerIndex),
        key: createKey(),
      });
    }
  }
  return ops;
}

export function applyServer(
  local: Progress,
  server: ServerProgress,
  profile: ServerProfile,
): Progress {
  const completedLessons: Record<string, true> = { ...local.completedLessons };
  for (const id of server.completedLessons) completedLessons[id] = true;

  // Resume where this phone left off; "furthest" is the max of both.
  const videoProgress: Progress['videoProgress'] = {};
  const videoIds = new Set([
    ...Object.keys(server.videoProgress),
    ...Object.keys(local.videoProgress),
  ]);
  for (const id of videoIds) {
    if (completedLessons[id]) continue;
    const mine = local.videoProgress[id];
    const theirs = server.videoProgress[id];
    videoProgress[id] = {
      position: mine?.position ?? theirs?.positionSec ?? 0,
      furthest: Math.max(mine?.furthest ?? 0, theirs?.furthestSec ?? 0),
    };
  }

  return {
    ...local,
    learnerName: profile.displayName ?? local.learnerName,
    answers: profile.onboarding ?? local.answers,
    xp: server.xp,
    streak: { count: server.streak.count, lastActiveDay: server.streak.lastActiveDay },
    completedLessons,
    quizResults: { ...local.quizResults, ...server.quizResults },
    // The server's last 7 days replace the local ones; older local days stay for the history.
    activity: {
      ...local.activity,
      ...Object.fromEntries(server.activity.map((day) => [day.day, day.xp])),
    },
    videoProgress,
  };
}
