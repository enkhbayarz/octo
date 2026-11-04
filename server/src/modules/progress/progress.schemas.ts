import { z } from '@hono/zod-openapi';

const ItemIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and dashes only');

export const LessonParamsSchema = z.object({
  lessonId: ItemIdSchema.openapi({ param: { name: 'lessonId', in: 'path' }, example: 'u1-l1' }),
});

export const QuizParamsSchema = z.object({
  quizId: ItemIdSchema.openapi({ param: { name: 'quizId', in: 'path' }, example: 'u1-quiz' }),
});

export const IdempotencyHeaderSchema = z.object({
  'idempotency-key': z
    .string()
    .min(8)
    .max(128)
    .regex(/^[\w-]+$/, 'Letters, digits, "-" and "_" only')
    .openapi({
      // Header names are case-insensitive; the lowercase form is what Node hands the validator.
      param: { name: 'idempotency-key', in: 'header' },
      description:
        'Unique per attempt (a UUID). Retrying with the same key replays the first response.',
      example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    }),
});

const TotalsSchema = z.object({
  xp: z.number().int(),
  /** Current streak in days (0 once it has lapsed). */
  streak: z.number().int(),
});

export const LessonCompletionSchema = z
  .object({
    lessonId: z.string(),
    xpGained: z.number().int(),
    streakIncreased: z.boolean(),
    /** True when the lesson was already done: nothing changed, nothing was awarded. */
    alreadyCompleted: z.boolean(),
    totals: TotalsSchema,
  })
  .openapi('LessonCompletion');

export const VideoProgressBodySchema = z
  .object({
    positionSec: z.number().min(0).max(86_400),
    furthestSec: z.number().min(0).max(86_400),
  })
  .openapi('VideoProgressInput');

export const VideoProgressSchema = z
  .object({
    lessonId: z.string(),
    /** Completed lessons replay from the start, so their position isn't kept. */
    completed: z.boolean(),
    positionSec: z.number().nullable(),
    furthestSec: z.number().nullable(),
  })
  .openapi('VideoProgress');

export const QuizAttemptBodySchema = z
  .object({
    /** Index of the chosen option, one per question, in question order. */
    answers: z.array(z.number().int().min(0)).min(1).max(50),
  })
  .openapi('QuizAttemptInput');

const QuizResultSchema = z
  .object({
    best: z.number().int(),
    total: z.number().int(),
    passed: z.boolean(),
    attempts: z.number().int(),
  })
  .openapi('QuizResult');

export const QuizAttemptSchema = z
  .object({
    attemptId: z.string(),
    quizId: z.string(),
    correct: z.number().int(),
    total: z.number().int(),
    passed: z.boolean(),
    xpGained: z.number().int(),
    streakIncreased: z.boolean(),
    /** Across all attempts at this quiz. */
    result: QuizResultSchema,
    totals: TotalsSchema,
  })
  .openapi('QuizAttempt');

export const ProgressSchema = z
  .object({
    xp: z.number().int(),
    streak: z.object({ count: z.number().int(), lastActiveDay: z.string().nullable() }),
    completedLessons: z.array(z.string()),
    quizResults: z.record(z.string(), QuizResultSchema),
    videoProgress: z.record(
      z.string(),
      z.object({ positionSec: z.number(), furthestSec: z.number() }),
    ),
    /** XP per learner-local day for the last 7 days, oldest first. */
    activity: z.array(z.object({ day: z.string(), xp: z.number().int() })),
  })
  .openapi('Progress');

export type LessonCompletion = z.infer<typeof LessonCompletionSchema>;
export type QuizAttemptResult = z.infer<typeof QuizAttemptSchema>;
export type Progress = z.infer<typeof ProgressSchema>;
export type VideoProgressResult = z.infer<typeof VideoProgressSchema>;
