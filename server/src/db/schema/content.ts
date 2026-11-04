import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export type Localized = { mn: string; en: string };
export type Phrase = { en: string; mn: string };

/** Only `published` content reaches learners; `draft` is for the future admin dashboard. */
export const contentStatus = pgEnum('content_status', ['draft', 'published', 'archived']);

/**
 * Shared by every editable content table. `version` is there for optimistic
 * locking once admins edit content: an update must name the version it read,
 * so two editors can't silently overwrite each other.
 */
const editable = () => ({
  status: contentStatus().notNull().default('draft'),
  version: integer().notNull().default(1),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Content ids are readable slugs ("u1-l1") shared with the mobile app's bundled course.

export const courses = pgTable('courses', {
  id: text().primaryKey(),
  title: jsonb().$type<Localized>().notNull(),
  shortTitle: jsonb().$type<Localized>().notNull(),
  ...editable(),
});

export const units = pgTable(
  'units',
  {
    id: text().primaryKey(),
    // RESTRICT: content with learner progress is archived, never deleted out from under it.
    courseId: text()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    position: integer().notNull(),
    title: jsonb().$type<Localized>().notNull(),
    ...editable(),
  },
  (table) => [index('units_course_position_idx').on(table.courseId, table.position)],
);

export const lessons = pgTable(
  'lessons',
  {
    id: text().primaryKey(),
    unitId: text()
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    position: integer().notNull(),
    title: jsonb().$type<Localized>().notNull(),
    description: jsonb().$type<Localized>().notNull(),
    videoUrl: text().notNull(),
    durationSec: integer().notNull(),
    phrases: jsonb().$type<Phrase[]>().notNull().default([]),
    ...editable(),
  },
  (table) => [
    index('lessons_unit_position_idx').on(table.unitId, table.position),
    check('lessons_duration_positive', sql`${table.durationSec} > 0`),
  ],
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: text().primaryKey(),
    /** One quiz per unit, enforced by the database rather than by convention. */
    unitId: text()
      .notNull()
      .unique()
      .references(() => units.id, { onDelete: 'restrict' }),
    passPercent: smallint().notNull(),
    ...editable(),
  },
  (table) => [check('quizzes_pass_percent_range', sql`${table.passPercent} BETWEEN 1 AND 100`)],
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid().primaryKey().defaultRandom(),
    quizId: text()
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    position: smallint().notNull(),
    text: text().notNull(),
    options: jsonb().$type<string[]>().notNull(),
    answerIndex: smallint().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('quiz_questions_quiz_position_unique').on(table.quizId, table.position),
    check('quiz_questions_answer_index_non_negative', sql`${table.answerIndex} >= 0`),
  ],
);
