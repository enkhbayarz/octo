import { sql } from 'drizzle-orm';
import {
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['learner', 'admin']);
export const learningReason = pgEnum('learning_reason', [
  'travel',
  'work',
  'school',
  'fun',
  'other',
]);
export const englishLevel = pgEnum('english_level', ['new', 'some', 'basic']);

/**
 * One row per Clerk user. Clerk owns identity (sign-in, email, OAuth); this
 * table owns everything the product needs: profile, role, totals.
 */
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Clerk's `sub` claim. Unique, so two first requests racing can't create two rows. */
    clerkUserId: text().notNull().unique(),
    displayName: text(),
    email: text(),
    imageUrl: text(),
    /** `admin` unlocks the future admin dashboard. Set by hand or by a Clerk webhook. */
    role: userRole().notNull().default('learner'),
    /** IANA zone; decides which calendar day an activity counts for. */
    timezone: text().notNull().default('Asia/Ulaanbaatar'),
    learningReason: learningReason(),
    englishLevel: englishLevel(),
    dailyGoalMinutes: smallint(),
    /** Denormalized totals, kept in step with `xp_events` inside the same transaction. */
    xp: integer().notNull().default(0),
    streakCount: integer().notNull().default(0),
    streakLastDay: date({ mode: 'string' }),
    /** `updated_at` of the last Clerk webhook applied; older, out-of-order events are skipped. */
    clerkUpdatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check('users_xp_non_negative', sql`${table.xp} >= 0`),
    check('users_streak_non_negative', sql`${table.streakCount} >= 0`),
    check('users_daily_goal_range', sql`${table.dailyGoalMinutes} BETWEEN 1 AND 240`),
    check('users_display_name_length', sql`char_length(${table.displayName}) BETWEEN 1 AND 24`),
  ],
);
