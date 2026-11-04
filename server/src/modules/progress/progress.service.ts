import { createHash } from 'node:crypto';

import { and, asc, count, eq, gte, sql } from 'drizzle-orm';

import type { Database, Executor, Transaction } from '../../db/client.js';
import {
  idempotencyKeys,
  lessonCompletions,
  quizAttempts,
  users,
  videoProgress,
  xpEvents,
} from '../../db/schema/index.js';
import { withTransaction } from '../../db/transaction.js';
import { addDays, dayKeyInZone } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import type { CourseService } from '../course/course.service.js';
import type { LeaderboardService } from '../leaderboard/leaderboard.service.js';
import type {
  LessonCompletion,
  Progress,
  QuizAttemptResult,
  VideoProgressResult,
} from './progress.schemas.js';
import {
  advanceStreak,
  currentStreak,
  type Done,
  findLesson,
  findQuiz,
  gradeQuiz,
  isPassingScore,
  isUnlocked,
  XP_PER_LESSON,
  XP_PER_QUIZ_PASS,
} from './progress.rules.js';

export type ProgressService = ReturnType<typeof createProgressService>;

/**
 * Locks the learner's row for the rest of the transaction (SELECT … FOR UPDATE).
 *
 * Every progress write takes this lock first, so one learner's writes run one
 * at a time. That prevents lost updates on `xp`/streak when two requests race
 * (two phones, a retry), and since the user row is always the first lock
 * taken, two transactions can never wait on each other in opposite orders:
 * no deadlocks. Different learners never block each other.
 */
async function lockLearner(tx: Transaction, userId: string) {
  const [row] = await tx
    .select({
      xp: users.xp,
      streakCount: users.streakCount,
      streakLastDay: users.streakLastDay,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  if (!row) throw new AppError('UNAUTHORIZED', 'This account no longer exists');
  return row;
}

async function loadDone(db: Executor, userId: string): Promise<Done> {
  const lessons = await db
    .select({ id: lessonCompletions.lessonId })
    .from(lessonCompletions)
    .where(eq(lessonCompletions.userId, userId));
  const quizzes = await db
    .selectDistinct({ id: quizAttempts.quizId })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.passed, true)));
  return {
    lessons: new Set(lessons.map((row) => row.id)),
    passedQuizzes: new Set(quizzes.map((row) => row.id)),
  };
}

export function createProgressService(deps: {
  db: Database;
  course: CourseService;
  leaderboard: LeaderboardService;
  clock: () => Date;
}) {
  const { db, course, leaderboard, clock } = deps;

  async function locateLesson(lessonId: string) {
    const located = await course.locate(lessonId);
    const lesson = located && findLesson(located.tree, lessonId);
    if (!located || !lesson) throw new AppError('NOT_FOUND', `Lesson "${lessonId}" not found`);
    return { ...located, lesson };
  }

  return {
    /** Idempotent by nature: completing a finished lesson changes nothing and awards nothing. */
    async completeLesson(userId: string, lessonId: string): Promise<LessonCompletion> {
      const { path } = await locateLesson(lessonId);
      const now = clock();

      const result = await withTransaction(db, async (tx) => {
        const learner = await lockLearner(tx, userId);
        const done = await loadDone(tx, userId);
        const today = dayKeyInZone(now, learner.timezone);
        const streakBefore = { count: learner.streakCount, lastDay: learner.streakLastDay };

        if (done.lessons.has(lessonId)) {
          return {
            lessonId,
            xpGained: 0,
            streakIncreased: false,
            alreadyCompleted: true,
            totals: { xp: learner.xp, streak: currentStreak(streakBefore, today) },
          };
        }
        if (!isUnlocked(path, lessonId, done)) {
          throw new AppError('ITEM_LOCKED', 'Finish the previous lesson or quiz first');
        }

        const { streak, increased } = advanceStreak(streakBefore, today);
        const xp = learner.xp + XP_PER_LESSON;
        await tx.insert(lessonCompletions).values({ userId, lessonId, xpAwarded: XP_PER_LESSON });
        await tx.insert(xpEvents).values({
          userId,
          source: 'lesson',
          sourceId: lessonId,
          amount: XP_PER_LESSON,
          day: today,
          createdAt: now,
        });
        await tx
          .update(users)
          .set({ xp, streakCount: streak.count, streakLastDay: streak.lastDay })
          .where(eq(users.id, userId));
        // A finished lesson replays from the start, so its resume point goes.
        await tx
          .delete(videoProgress)
          .where(and(eq(videoProgress.userId, userId), eq(videoProgress.lessonId, lessonId)));

        return {
          lessonId,
          xpGained: XP_PER_LESSON,
          streakIncreased: increased,
          alreadyCompleted: false,
          totals: { xp, streak: streak.count },
        };
      });

      // After commit: the leaderboard is a cache and must never roll back real progress.
      if (result.xpGained > 0) await leaderboard.recordXp(userId, result.xpGained, now);
      return result;
    },

    /**
     * Grades an attempt on the server (the client's own grading is never
     * trusted) and records it once per Idempotency-Key.
     */
    async submitQuizAttempt(
      userId: string,
      quizId: string,
      answers: number[],
      idempotencyKey: string,
    ): Promise<{ result: QuizAttemptResult; replayed: boolean }> {
      const located = await course.locate(quizId);
      const quiz = located && findQuiz(located.tree, quizId);
      if (!located || !quiz) throw new AppError('NOT_FOUND', `Quiz "${quizId}" not found`);

      const problems = [
        ...(answers.length === quiz.questions.length
          ? []
          : [
              {
                path: 'answers',
                message: `Expected ${quiz.questions.length} answers, got ${answers.length}`,
              },
            ]),
        ...answers.flatMap((answer, index) => {
          const options = quiz.questions[index]?.options.length ?? 0;
          return answer < options || !quiz.questions[index]
            ? []
            : [
                {
                  path: `answers.${index}`,
                  message: `Choose an option between 0 and ${options - 1}`,
                },
              ];
        }),
      ];
      if (problems.length > 0)
        throw new AppError('VALIDATION_FAILED', 'Request validation failed', problems);

      const requestHash = createHash('sha256')
        .update(JSON.stringify({ quizId, answers }))
        .digest('hex');
      const now = clock();

      const outcome = await withTransaction(db, async (tx) => {
        const learner = await lockLearner(tx, userId);

        // Safe to check-then-insert: the row lock above serializes this learner's requests.
        const [previous] = await tx
          .select({ requestHash: idempotencyKeys.requestHash, body: idempotencyKeys.responseBody })
          .from(idempotencyKeys)
          .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, idempotencyKey)));
        if (previous) {
          if (previous.requestHash !== requestHash) {
            throw new AppError(
              'IDEMPOTENCY_KEY_REUSED',
              'This Idempotency-Key was already used for a different request',
            );
          }
          return { result: previous.body as QuizAttemptResult, replayed: true };
        }

        const done = await loadDone(tx, userId);
        if (!isUnlocked(located.path, quizId, done)) {
          throw new AppError('ITEM_LOCKED', 'Finish every lesson in this unit first');
        }

        const { correct, total } = gradeQuiz(quiz.questions, answers);
        const passed = isPassingScore(correct, total, quiz.passPercent);
        const xpGained = passed && !done.passedQuizzes.has(quizId) ? XP_PER_QUIZ_PASS : 0;
        const today = dayKeyInZone(now, learner.timezone);
        // Any attempt counts as learning for the streak, even a failed one.
        const { streak, increased } = advanceStreak(
          { count: learner.streakCount, lastDay: learner.streakLastDay },
          today,
        );
        const xp = learner.xp + xpGained;

        const [attempt] = await tx
          .insert(quizAttempts)
          .values({
            userId,
            quizId,
            answers,
            correct,
            total,
            passed,
            xpAwarded: xpGained,
            createdAt: now,
          })
          .returning({ id: quizAttempts.id });
        if (xpGained > 0) {
          await tx.insert(xpEvents).values({
            userId,
            source: 'quiz',
            sourceId: quizId,
            amount: xpGained,
            day: today,
            createdAt: now,
          });
        }
        await tx
          .update(users)
          .set({ xp, streakCount: streak.count, streakLastDay: streak.lastDay })
          .where(eq(users.id, userId));

        // An aggregate without GROUP BY always returns exactly one row.
        const [summary] = await tx
          .select({
            best: sql<number>`max(${quizAttempts.correct})::int`,
            attempts: count(),
            passed: sql<boolean>`bool_or(${quizAttempts.passed})`,
          })
          .from(quizAttempts)
          .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId)));

        const result: QuizAttemptResult = {
          attemptId: attempt!.id,
          quizId,
          correct,
          total,
          passed,
          xpGained,
          streakIncreased: increased,
          result: {
            best: summary!.best,
            total,
            passed: summary!.passed,
            attempts: summary!.attempts,
          },
          totals: { xp, streak: streak.count },
        };
        await tx.insert(idempotencyKeys).values({
          userId,
          key: idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseBody: result,
        });
        return { result, replayed: false };
      });

      if (!outcome.replayed && outcome.result.xpGained > 0) {
        await leaderboard.recordXp(userId, outcome.result.xpGained, now);
      }
      return outcome;
    },

    /**
     * Upsert without a lock: `furthest` only ever grows (GREATEST), so
     * concurrent or out-of-order saves converge to the same row.
     */
    async saveVideoProgress(
      userId: string,
      lessonId: string,
      input: { positionSec: number; furthestSec: number },
    ): Promise<VideoProgressResult> {
      const { lesson } = await locateLesson(lessonId);
      const positionSec = Math.min(input.positionSec, lesson.durationSec);
      const furthestSec = Math.min(Math.max(input.furthestSec, positionSec), lesson.durationSec);

      const { rows } = await db.execute<{ position_sec: number; furthest_sec: number }>(sql`
        insert into video_progress (user_id, lesson_id, position_sec, furthest_sec, updated_at)
        select ${userId}, ${lessonId}, ${positionSec}, ${furthestSec}, now()
        where not exists (
          select 1 from lesson_completions where user_id = ${userId} and lesson_id = ${lessonId})
        on conflict (user_id, lesson_id) do update set
          position_sec = excluded.position_sec,
          furthest_sec = greatest(video_progress.furthest_sec, excluded.furthest_sec),
          updated_at = now()
        returning position_sec, furthest_sec`);

      const row = rows[0];
      return row
        ? {
            lessonId,
            completed: false,
            positionSec: row.position_sec,
            furthestSec: row.furthest_sec,
          }
        : { lessonId, completed: true, positionSec: null, furthestSec: null };
    },

    /**
     * Everything the app shows, read in one REPEATABLE READ snapshot so the
     * totals and the lists can't disagree with a write landing in between.
     */
    async getProgress(userId: string): Promise<Progress> {
      const now = clock();
      return db.transaction(
        async (tx) => {
          const [learner] = await tx
            .select({
              xp: users.xp,
              streakCount: users.streakCount,
              streakLastDay: users.streakLastDay,
              timezone: users.timezone,
            })
            .from(users)
            .where(eq(users.id, userId));
          if (!learner) throw new AppError('UNAUTHORIZED', 'This account no longer exists');
          const today = dayKeyInZone(now, learner.timezone);
          const since = addDays(today, -6);

          const completions = await tx
            .select({ lessonId: lessonCompletions.lessonId })
            .from(lessonCompletions)
            .where(eq(lessonCompletions.userId, userId))
            .orderBy(asc(lessonCompletions.completedAt));
          const quizRows = await tx
            .select({
              quizId: quizAttempts.quizId,
              best: sql<number>`max(${quizAttempts.correct})::int`,
              total: sql<number>`max(${quizAttempts.total})::int`,
              passed: sql<boolean>`bool_or(${quizAttempts.passed})`,
              attempts: count(),
            })
            .from(quizAttempts)
            .where(eq(quizAttempts.userId, userId))
            .groupBy(quizAttempts.quizId);
          const videoRows = await tx
            .select({
              lessonId: videoProgress.lessonId,
              positionSec: videoProgress.positionSec,
              furthestSec: videoProgress.furthestSec,
            })
            .from(videoProgress)
            .where(eq(videoProgress.userId, userId));
          const activityRows = await tx
            .select({ day: xpEvents.day, xp: sql<number>`sum(${xpEvents.amount})::int` })
            .from(xpEvents)
            .where(and(eq(xpEvents.userId, userId), gte(xpEvents.day, since)))
            .groupBy(xpEvents.day);

          const completed = new Set(completions.map((row) => row.lessonId));
          const xpByDay = new Map(activityRows.map((row) => [row.day, row.xp]));
          return {
            xp: learner.xp,
            streak: {
              count: currentStreak(
                { count: learner.streakCount, lastDay: learner.streakLastDay },
                today,
              ),
              lastActiveDay: learner.streakLastDay,
            },
            completedLessons: [...completed],
            quizResults: Object.fromEntries(
              quizRows.map(({ quizId, ...result }) => [quizId, result]),
            ),
            videoProgress: Object.fromEntries(
              videoRows
                .filter((row) => !completed.has(row.lessonId))
                .map(({ lessonId, ...position }) => [lessonId, position]),
            ),
            activity: Array.from({ length: 7 }, (_, index) => {
              const day = addDays(since, index);
              return { day, xp: xpByDay.get(day) ?? 0 };
            }),
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}
