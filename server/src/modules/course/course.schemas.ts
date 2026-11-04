import { z } from '@hono/zod-openapi';

import { LocalizedSchema } from '../../http/schemas.js';

export const CourseIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and dashes only');

export const PhraseSchema = z.object({ en: z.string(), mn: z.string() }).openapi('Phrase');

export const LessonSchema = z
  .object({
    id: z.string().openapi({ example: 'u1-l1' }),
    title: LocalizedSchema,
    description: LocalizedSchema,
    videoUrl: z.string(),
    durationSec: z.number().int(),
    phrases: z.array(PhraseSchema),
  })
  .openapi('Lesson');

export const QuestionSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    options: z.array(z.string()),
    /** Included for instant offline feedback in the app; the server still grades attempts itself. */
    answerIndex: z.number().int(),
  })
  .openapi('Question');

export const QuizSchema = z
  .object({
    id: z.string().openapi({ example: 'u1-quiz' }),
    passPercent: z.number().int(),
    questions: z.array(QuestionSchema),
  })
  .openapi('Quiz');

export const UnitSchema = z
  .object({
    id: z.string().openapi({ example: 'u1' }),
    title: LocalizedSchema,
    lessons: z.array(LessonSchema),
    quiz: QuizSchema.nullable(),
  })
  .openapi('Unit');

export const CourseSchema = z
  .object({
    id: z.string().openapi({ example: 'english-a1' }),
    title: LocalizedSchema,
    shortTitle: LocalizedSchema,
    units: z.array(UnitSchema),
  })
  .openapi('Course');

export const CourseSummarySchema = z
  .object({
    id: z.string(),
    title: LocalizedSchema,
    shortTitle: LocalizedSchema,
    unitCount: z.number().int(),
    lessonCount: z.number().int(),
  })
  .openapi('CourseSummary');

export type CourseTree = z.infer<typeof CourseSchema>;
export type CourseSummary = z.infer<typeof CourseSummarySchema>;
export type LessonDto = z.infer<typeof LessonSchema>;
export type QuizDto = z.infer<typeof QuizSchema>;
