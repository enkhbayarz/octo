import { createRoute, z } from '@hono/zod-openapi';

import type { AppEnv } from '../../http/context.js';
import { createRouter } from '../../http/router.js';
import { dataOf, errors } from '../../http/schemas.js';
import { AppError } from '../../lib/errors.js';
import { CourseIdSchema, CourseSchema, CourseSummarySchema } from './course.schemas.js';
import type { CourseService } from './course.service.js';

const listCourses = createRoute({
  method: 'get',
  path: '/courses',
  tags: ['Course'],
  summary: 'Published courses',
  responses: {
    200: {
      description: 'Courses with unit and lesson counts',
      content: { 'application/json': { schema: dataOf(z.array(CourseSummarySchema)) } },
    },
  },
});

const getCourse = createRoute({
  method: 'get',
  path: '/courses/{courseId}',
  tags: ['Course'],
  summary: 'A course with its units, lessons and quizzes',
  description:
    'Public and cacheable. Send the returned ETag back in `If-None-Match` to get a 304 when nothing changed.',
  request: {
    params: z.object({
      courseId: CourseIdSchema.openapi({
        param: { name: 'courseId', in: 'path' },
        example: 'english-a1',
      }),
    }),
  },
  responses: {
    200: {
      description: 'The full course',
      content: { 'application/json': { schema: dataOf(CourseSchema) } },
    },
    304: { description: 'Unchanged since the ETag in If-None-Match' },
    400: errors[400],
    404: errors[404],
  },
});

function matchesEtag(ifNoneMatch: string | undefined, etag: string) {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .some((tag) => tag === etag || tag === '*');
}

export function courseRoutes(course: CourseService) {
  return createRouter<AppEnv>()
    .openapi(listCourses, async (c) => {
      c.header('Cache-Control', 'public, max-age=60');
      return c.json({ data: await course.list() }, 200);
    })
    .openapi(getCourse, async (c) => {
      const { courseId } = c.req.valid('param');
      const found = await course.get(courseId);
      if (!found) throw new AppError('NOT_FOUND', `Course "${courseId}" not found`);

      c.header('ETag', found.etag);
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
      if (matchesEtag(c.req.header('if-none-match'), found.etag)) return c.body(null, 304);
      return c.json({ data: found.tree }, 200);
    });
}
