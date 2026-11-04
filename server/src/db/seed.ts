import { pathToFileURL } from 'node:url';

import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { COURSE_LIST_CACHE_KEY, courseCacheKey } from '../modules/course/course.service.js';
import type { Database } from './client.js';
import { courses, lessons, quizQuestions, quizzes, units } from './schema/index.js';
import courseJson from './seed-data/course.json' with { type: 'json' };

const Localized = z.object({ mn: z.string().min(1), en: z.string().min(1) });
const Id = z.string().regex(/^[a-z0-9-]+$/);

/** The app's bundled course.json, validated so bad content fails the deploy, not a learner. */
const SeedCourseSchema = z.object({
  id: Id,
  title: Localized,
  shortTitle: Localized,
  units: z.array(
    z.object({
      id: Id,
      title: Localized,
      lessons: z.array(
        z.object({
          id: Id,
          title: Localized,
          description: Localized,
          // An absolute URL, or a path in the media bucket served by /media.
          videoUrl: z.union([z.url(), z.string().regex(/^\/media\/videos\/[\w./-]+$/)]),
          durationSec: z.number().int().positive(),
          phrases: z.array(z.object({ en: z.string(), mn: z.string() })),
        }),
      ),
      quiz: z.object({
        id: Id,
        passPercent: z.number().int().min(1).max(100),
        questions: z.array(
          z
            .object({
              text: z.string().min(1),
              options: z.array(z.string().min(1)).min(2),
              answerIndex: z.number().int().min(0),
            })
            .refine(
              (question) => question.answerIndex < question.options.length,
              'answerIndex out of range',
            ),
        ),
      }),
    }),
  ),
});

export type SeedCourse = z.infer<typeof SeedCourseSchema>;

/**
 * Upserts the course and publishes it, in one transaction: either all of it
 * lands or none. Safe to run on every deploy. One multi-row statement per
 * table, not one per row.
 */
export async function seedCourse(db: Database, input: unknown = courseJson) {
  const course = SeedCourseSchema.parse(input);
  const excluded = (column: string) => sql.raw(`excluded.${column}`);

  const unitRows = course.units.map((unit, position) => ({
    id: unit.id,
    courseId: course.id,
    position,
    title: unit.title,
    status: 'published' as const,
  }));
  const lessonRows = course.units.flatMap((unit) =>
    unit.lessons.map((lesson, position) => ({
      ...lesson,
      unitId: unit.id,
      position,
      status: 'published' as const,
    })),
  );
  const quizRows = course.units.map((unit) => ({
    id: unit.quiz.id,
    unitId: unit.id,
    passPercent: unit.quiz.passPercent,
    status: 'published' as const,
  }));
  const questionRows = course.units.flatMap((unit) =>
    unit.quiz.questions.map((question, position) => ({
      ...question,
      quizId: unit.quiz.id,
      position,
    })),
  );

  await db.transaction(async (tx) => {
    await tx
      .insert(courses)
      .values({
        id: course.id,
        title: course.title,
        shortTitle: course.shortTitle,
        status: 'published',
      })
      .onConflictDoUpdate({
        target: courses.id,
        set: {
          title: excluded('title'),
          shortTitle: excluded('short_title'),
          status: excluded('status'),
        },
      });
    await tx
      .insert(units)
      .values(unitRows)
      .onConflictDoUpdate({
        target: units.id,
        set: {
          courseId: excluded('course_id'),
          position: excluded('position'),
          title: excluded('title'),
          status: excluded('status'),
        },
      });
    await tx
      .insert(lessons)
      .values(lessonRows)
      .onConflictDoUpdate({
        target: lessons.id,
        set: {
          unitId: excluded('unit_id'),
          position: excluded('position'),
          title: excluded('title'),
          description: excluded('description'),
          videoUrl: excluded('video_url'),
          durationSec: excluded('duration_sec'),
          phrases: excluded('phrases'),
          status: excluded('status'),
        },
      });
    await tx
      .insert(quizzes)
      .values(quizRows)
      .onConflictDoUpdate({
        target: quizzes.id,
        set: {
          unitId: excluded('unit_id'),
          passPercent: excluded('pass_percent'),
          status: excluded('status'),
        },
      });
    await tx
      .insert(quizQuestions)
      .values(questionRows)
      .onConflictDoUpdate({
        target: [quizQuestions.quizId, quizQuestions.position],
        set: {
          text: excluded('text'),
          options: excluded('options'),
          answerIndex: excluded('answer_index'),
        },
      });
    // Questions removed from the JSON.
    for (const unit of course.units) {
      await tx
        .delete(quizQuestions)
        .where(
          and(
            eq(quizQuestions.quizId, unit.quiz.id),
            gte(quizQuestions.position, unit.quiz.questions.length),
          ),
        );
    }
  });

  return {
    courseId: course.id,
    units: unitRows.length,
    lessons: lessonRows.length,
    questions: questionRows.length,
    cacheKeys: [courseCacheKey(course.id), COURSE_LIST_CACHE_KEY],
  };
}

/* v8 ignore start -- CLI entry, exercised as a child process in test/e2e/process.test.ts */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = z.object({ DATABASE_URL: z.url(), REDIS_URL: z.url().optional() }).parse(process.env);
  const [{ default: pg }, { createDb }] = await Promise.all([import('pg'), import('./client.js')]);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  const summary = await seedCourse(createDb(pool));
  await pool.end();

  // New content must not be hidden behind the cached old version.
  if (env.REDIS_URL) {
    const { Redis } = await import('ioredis');
    const redis = new Redis(env.REDIS_URL, {
      family: 0,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
    });
    await redis
      .del(...summary.cacheKeys)
      .catch((err: unknown) => console.warn('cache not invalidated:', err));
    redis.disconnect();
  }
  console.log(
    `seeded ${summary.courseId}: ${summary.units} units, ${summary.lessons} lessons, ${summary.questions} questions`,
  );
}
/* v8 ignore stop */
