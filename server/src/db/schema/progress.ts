import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { lessons, quizzes } from './content.js';
import { users } from './users.js';

// Progress rows CASCADE with their user (account deletion removes everything)
// and RESTRICT on content (content is archived, not deleted, once learned).

/** The primary key makes completing a lesson naturally idempotent: a second insert can't happen. */
export const lessonCompletions = pgTable(
  'lesson_completions',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: text()
      .notNull()
      .references(() => lessons.id, { onDelete: 'restrict' }),
    xpAwarded: smallint().notNull(),
    completedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.lessonId] })],
);

/** Every attempt is kept; best score and pass state are derived with an aggregate. */
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: text()
      .notNull()
      .references(() => quizzes.id, { onDelete: 'restrict' }),
    answers: jsonb().$type<number[]>().notNull(),
    correct: smallint().notNull(),
    total: smallint().notNull(),
    passed: boolean().notNull(),
    xpAwarded: smallint().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('quiz_attempts_user_quiz_idx').on(table.userId, table.quizId)],
);

/** Where a learner left an unfinished lesson video. `furthest` only moves forward. */
export const videoProgress = pgTable(
  'video_progress',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: text()
      .notNull()
      .references(() => lessons.id, { onDelete: 'restrict' }),
    positionSec: real().notNull(),
    furthestSec: real().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.lessonId] })],
);

export const xpSource = pgEnum('xp_source', ['lesson', 'quiz']);

/**
 * Append-only XP ledger: the source of truth for "XP per day" and the weekly
 * leaderboard. `users.xp` is a running total of the same rows.
 */
export const xpEvents = pgTable(
  'xp_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: xpSource().notNull(),
    sourceId: text().notNull(),
    amount: smallint().notNull(),
    /** The learner-local day the XP counts for (activity chart, streaks). */
    day: date({ mode: 'string' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Weekly leaderboard: range on created_at, then sum per user, answered from the index alone.
    index('xp_events_created_user_amount_idx').on(table.createdAt, table.userId, table.amount),
    // Activity chart: one learner's recent days.
    index('xp_events_user_day_idx').on(table.userId, table.day),
    check('xp_events_amount_positive', sql`${table.amount} > 0`),
  ],
);

/**
 * Stored responses for requests sent with an `Idempotency-Key`, so a retry
 * after a dropped connection replays the first result instead of acting twice.
 * Kept for 24 hours (see jobs/cleanup).
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text().notNull(),
    /** Hash of the request; the same key with a different body is rejected. */
    requestHash: text().notNull(),
    responseStatus: smallint().notNull(),
    responseBody: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    index('idempotency_keys_created_idx').on(table.createdAt),
  ],
);
