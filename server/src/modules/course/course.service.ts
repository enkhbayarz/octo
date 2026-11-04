import { createHash } from 'node:crypto';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';

import type { Cache } from '../../cache/cache.js';
import type { Database } from '../../db/client.js';
import { courses, lessons, quizQuestions, quizzes, units } from '../../db/schema/index.js';
import { buildPath, type PathItem } from '../progress/progress.rules.js';
import type { CourseSummary, CourseTree } from './course.schemas.js';

export const courseCacheKey = (courseId: string) => `cache:course:${courseId}`;
export const COURSE_LIST_CACHE_KEY = 'cache:courses';

/** Content changes only on deploy (seed) or, later, from the admin dashboard, which invalidates. */
const COURSE_TTL_SEC = 60 * 60;
const COURSE_LIST_TTL_SEC = 5 * 60;

export type CourseService = ReturnType<typeof createCourseService>;
export type CachedCourse = { tree: CourseTree; etag: string };

export function createCourseService({ db, cache }: { db: Database; cache: Cache }) {
  /**
   * Loads a whole course in five queries however many units it has: one per
   * table, joined in memory. Fetching each unit's lessons in a loop instead
   * would be the classic N+1 (1 + units + quizzes round trips).
   */
  async function loadTree(courseId: string): Promise<CourseTree | null> {
    const [course] = await db
      .select({ id: courses.id, title: courses.title, shortTitle: courses.shortTitle })
      .from(courses)
      .where(and(eq(courses.id, courseId), eq(courses.status, 'published')));
    if (!course) return null;

    const unitRows = await db
      .select({ id: units.id, title: units.title })
      .from(units)
      .where(and(eq(units.courseId, courseId), eq(units.status, 'published')))
      .orderBy(asc(units.position));
    const unitIds = unitRows.map((unit) => unit.id);
    if (unitIds.length === 0) return { ...course, units: [] };

    const [lessonRows, quizRows] = await Promise.all([
      db
        .select()
        .from(lessons)
        .where(and(inArray(lessons.unitId, unitIds), eq(lessons.status, 'published')))
        .orderBy(asc(lessons.unitId), asc(lessons.position)),
      db
        .select({ id: quizzes.id, unitId: quizzes.unitId, passPercent: quizzes.passPercent })
        .from(quizzes)
        .where(and(inArray(quizzes.unitId, unitIds), eq(quizzes.status, 'published'))),
    ]);
    const questionRows =
      quizRows.length === 0
        ? []
        : await db
            .select()
            .from(quizQuestions)
            .where(
              inArray(
                quizQuestions.quizId,
                quizRows.map((quiz) => quiz.id),
              ),
            )
            .orderBy(asc(quizQuestions.quizId), asc(quizQuestions.position));

    return {
      ...course,
      units: unitRows.map((unit) => {
        const quiz = quizRows.find((row) => row.unitId === unit.id);
        return {
          ...unit,
          lessons: lessonRows
            .filter((lesson) => lesson.unitId === unit.id)
            .map(({ id, title, description, videoUrl, durationSec, phrases }) => ({
              id,
              title,
              description,
              videoUrl,
              durationSec,
              phrases,
            })),
          quiz: quiz
            ? {
                id: quiz.id,
                passPercent: quiz.passPercent,
                questions: questionRows
                  .filter((question) => question.quizId === quiz.id)
                  .map(({ id, text, options, answerIndex }) => ({
                    id,
                    text,
                    options,
                    answerIndex,
                  })),
              }
            : null,
        };
      }),
    };
  }

  async function loadSummaries(): Promise<CourseSummary[]> {
    return db
      .select({
        id: courses.id,
        title: courses.title,
        shortTitle: courses.shortTitle,
        unitCount: sql<number>`(
          select count(*)::int from units u
          where u.course_id = courses.id and u.status = 'published')`,
        lessonCount: sql<number>`(
          select count(*)::int from lessons l join units u on u.id = l.unit_id
          where u.course_id = courses.id and u.status = 'published' and l.status = 'published')`,
      })
      .from(courses)
      .where(eq(courses.status, 'published'))
      .orderBy(asc(courses.id));
  }

  async function get(courseId: string): Promise<CachedCourse | null> {
    return cache.getOrLoad('course', courseCacheKey(courseId), COURSE_TTL_SEC, async () => {
      const tree = await loadTree(courseId);
      if (!tree) return null;
      const hash = createHash('sha256').update(JSON.stringify(tree)).digest('base64url');
      return { tree, etag: `"${hash.slice(0, 27)}"` };
    });
  }

  return {
    get,

    list: () =>
      cache.getOrLoad('course-list', COURSE_LIST_CACHE_KEY, COURSE_LIST_TTL_SEC, loadSummaries),

    /** Finds the published course containing a lesson or quiz, with its ordered learning path. */
    async locate(itemId: string): Promise<{ tree: CourseTree; path: PathItem[] } | null> {
      const [row] = await unionAll(
        db
          .select({ courseId: units.courseId })
          .from(lessons)
          .innerJoin(units, eq(units.id, lessons.unitId))
          .where(and(eq(lessons.id, itemId), eq(lessons.status, 'published'))),
        db
          .select({ courseId: units.courseId })
          .from(quizzes)
          .innerJoin(units, eq(units.id, quizzes.unitId))
          .where(and(eq(quizzes.id, itemId), eq(quizzes.status, 'published'))),
      ).limit(1);
      if (!row) return null;
      const course = await get(row.courseId);
      return course ? { tree: course.tree, path: buildPath(course.tree) } : null;
    },
  };
}
