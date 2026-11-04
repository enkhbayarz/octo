import { z } from '@hono/zod-openapi';

import { isValidTimeZone } from '../../lib/dates.js';

export const MAX_NAME_LENGTH = 24;

/** Same rule as the app: trim, collapse inner spaces, 1–24 characters. */
const DisplayNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'Name is empty')
      .max(MAX_NAME_LENGTH, `At most ${MAX_NAME_LENGTH} characters`),
  );

const OnboardingSchema = z
  .object({
    reason: z.enum(['travel', 'work', 'school', 'fun', 'other']),
    level: z.enum(['new', 'some', 'basic']),
    dailyMinutes: z.number().int().min(1).max(240),
  })
  .openapi('Onboarding');

export const UpdateProfileSchema = z
  .object({
    displayName: DisplayNameSchema.optional(),
    timezone: z
      .string()
      .refine(isValidTimeZone, 'Not an IANA time zone, e.g. "Asia/Ulaanbaatar"')
      .optional(),
    onboarding: OnboardingSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to update')
  .openapi('ProfileUpdate');

export const ProfileSchema = z
  .object({
    id: z.string(),
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    imageUrl: z.string().nullable(),
    role: z.enum(['learner', 'admin']),
    timezone: z.string(),
    onboarding: OnboardingSchema.nullable(),
    xp: z.number().int(),
    streak: z.number().int(),
    createdAt: z.string(),
  })
  .openapi('Profile');

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileUpdate = z.infer<typeof UpdateProfileSchema>;
