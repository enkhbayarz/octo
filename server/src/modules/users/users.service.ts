import { eq, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import type { CurrentUser } from '../../http/context.js';
import { dayKeyInZone } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { currentStreak } from '../progress/progress.rules.js';
import { MAX_NAME_LENGTH, type Profile, type ProfileUpdate } from './users.schemas.js';

export type UsersService = ReturnType<typeof createUsersService>;

/** The subset of Clerk's user payload this API keeps. */
export type ClerkUser = {
  id: string;
  firstName: string | null;
  username: string | null;
  email: string | null;
  imageUrl: string | null;
  updatedAt: number;
};

const currentUserColumns = {
  id: users.id,
  clerkUserId: users.clerkUserId,
  role: users.role,
  timezone: users.timezone,
};

export function createUsersService({ db, clock }: { db: Database; clock: () => Date }) {
  async function findByClerkId(clerkUserId: string) {
    const [user] = await db
      .select(currentUserColumns)
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId));
    return user;
  }

  async function getProfile(userId: string): Promise<Profile> {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    if (!row) throw new AppError('UNAUTHORIZED', 'This account no longer exists');
    const today = dayKeyInZone(clock(), row.timezone);
    return {
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      imageUrl: row.imageUrl,
      role: row.role,
      timezone: row.timezone,
      onboarding:
        row.learningReason && row.englishLevel && row.dailyGoalMinutes
          ? {
              reason: row.learningReason,
              level: row.englishLevel,
              dailyMinutes: row.dailyGoalMinutes,
            }
          : null,
      xp: row.xp,
      streak: currentStreak({ count: row.streakCount, lastDay: row.streakLastDay }, today),
      createdAt: row.createdAt.toISOString(),
    };
  }

  return {
    /**
     * The learner for a verified Clerk id, created on first sight ("just in
     * time"), so the app never needs a separate sign-up call. The common case
     * is one indexed SELECT. Two first requests racing both try the INSERT;
     * the unique constraint lets exactly one win and the other re-reads.
     */
    async resolve(clerkUserId: string): Promise<CurrentUser> {
      const existing = await findByClerkId(clerkUserId);
      if (existing) return existing;
      const [created] = await db
        .insert(users)
        .values({ clerkUserId })
        .onConflictDoNothing({ target: users.clerkUserId })
        .returning(currentUserColumns);
      const user = created ?? (await findByClerkId(clerkUserId));
      if (!user) throw new AppError('INTERNAL', 'Could not create the learner');
      return user;
    },

    getProfile,

    async updateProfile(userId: string, update: ProfileUpdate): Promise<Profile> {
      await db
        .update(users)
        .set({
          displayName: update.displayName,
          timezone: update.timezone,
          learningReason: update.onboarding?.reason,
          englishLevel: update.onboarding?.level,
          dailyGoalMinutes: update.onboarding?.dailyMinutes,
        })
        .where(eq(users.id, userId));
      return getProfile(userId);
    },

    /**
     * Applies a Clerk `user.created`/`user.updated` webhook. Webhooks can
     * arrive late, twice, or out of order, so an update only lands when it is
     * newer than the last one applied; replays are harmless.
     */
    async syncFromClerk(user: ClerkUser): Promise<void> {
      const name = (user.firstName ?? user.username)?.trim().slice(0, MAX_NAME_LENGTH) || null;
      await db
        .insert(users)
        .values({
          clerkUserId: user.id,
          email: user.email,
          imageUrl: user.imageUrl,
          displayName: name,
          clerkUpdatedAt: new Date(user.updatedAt),
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: {
            email: sql`excluded.email`,
            imageUrl: sql`excluded.image_url`,
            // A name the learner chose in the app wins over the Clerk profile name.
            displayName: sql`coalesce(${users.displayName}, excluded.display_name)`,
            clerkUpdatedAt: sql`excluded.clerk_updated_at`,
          },
          setWhere: sql`${users.clerkUpdatedAt} is null or ${users.clerkUpdatedAt} < excluded.clerk_updated_at`,
        });
    },

    /** Account deleted in Clerk: remove the learner; progress rows cascade. */
    async deleteByClerkId(clerkUserId: string): Promise<boolean> {
      const deleted = await db
        .delete(users)
        .where(eq(users.clerkUserId, clerkUserId))
        .returning({ id: users.id });
      return deleted.length > 0;
    },
  };
}
