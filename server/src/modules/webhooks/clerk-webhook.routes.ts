import { verifyWebhook } from '@clerk/backend/webhooks';
import { createRoute, z } from '@hono/zod-openapi';

import type { AppEnv } from '../../http/context.js';
import { createRouter } from '../../http/router.js';
import { dataOf, errors } from '../../http/schemas.js';
import { AppError } from '../../lib/errors.js';
import type { UsersService } from '../users/users.service.js';

const clerkWebhook = createRoute({
  method: 'post',
  path: '/clerk',
  tags: ['Webhooks'],
  summary: 'Clerk user events (created, updated, deleted)',
  description:
    'Signed by Svix. Requests with a missing, invalid or stale (>5 min) signature are rejected. Clerk retries failed deliveries with backoff, and every handler here is safe to run twice.',
  responses: {
    200: {
      description: 'Accepted',
      content: { 'application/json': { schema: dataOf(z.object({ received: z.literal(true) })) } },
    },
    400: errors[400],
    503: errors[503],
  },
});

export function clerkWebhookRoutes(users: UsersService, signingSecret: string | undefined) {
  return createRouter<AppEnv>().openapi(clerkWebhook, async (c) => {
    if (!signingSecret) throw new AppError('SERVICE_UNAVAILABLE', 'Webhooks are not configured');

    let event: Awaited<ReturnType<typeof verifyWebhook>>;
    try {
      event = await verifyWebhook(c.req.raw, { signingSecret });
    } catch (err) {
      c.var.log.warn({ err }, 'webhook signature rejected');
      throw new AppError('BAD_REQUEST', 'Invalid webhook signature');
    }

    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const user = event.data;
        const primary = user.email_addresses.find(
          (email) => email.id === user.primary_email_address_id,
        );
        await users.syncFromClerk({
          id: user.id,
          firstName: user.first_name,
          username: user.username,
          email: primary?.email_address ?? null,
          imageUrl: user.image_url || null,
          updatedAt: user.updated_at,
        });
        break;
      }
      case 'user.deleted':
        if (event.data.id) await users.deleteByClerkId(event.data.id);
        break;
      default:
        // Subscribed to more than we handle; acknowledge so Clerk doesn't retry.
        break;
    }
    c.var.log.info({ type: event.type }, 'webhook processed');
    return c.json({ data: { received: true as const } }, 200);
  });
}
