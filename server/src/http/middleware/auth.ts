import { verifyToken } from '@clerk/backend';
import type { MiddlewareHandler } from 'hono';

import type { Config } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type { CurrentUser, AuthedEnv } from '../context.js';

export type TokenClaims = { sub: string };
export type VerifyToken = (token: string) => Promise<TokenClaims>;

/**
 * Verifies Clerk session tokens (short-lived RS256 JWTs). With CLERK_JWT_KEY
 * this needs no network call at all; with only CLERK_SECRET_KEY, Clerk's
 * public keys are fetched once and cached.
 */
export function createClerkVerifier(config: Config): VerifyToken {
  const authorizedParties = config.CLERK_AUTHORIZED_PARTIES;
  return async (token) => {
    const payload = await verifyToken(token, {
      jwtKey: config.CLERK_JWT_KEY,
      secretKey: config.CLERK_SECRET_KEY,
      authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined,
    });
    return { sub: payload.sub };
  };
}

/**
 * Requires `Authorization: Bearer <Clerk session token>` and loads the
 * matching learner (creating the row on first sight).
 */
export function requireUser(
  verify: VerifyToken,
  resolveUser: (clerkUserId: string) => Promise<CurrentUser>,
): MiddlewareHandler<AuthedEnv> {
  return async (c, next) => {
    const unauthorized = (message: string) => {
      c.header('WWW-Authenticate', 'Bearer');
      return new AppError('UNAUTHORIZED', message);
    };

    const token = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw unauthorized('Sign in required: send a Bearer session token');

    let claims: TokenClaims;
    try {
      claims = await verify(token);
    } catch (err) {
      c.var.log.debug({ err }, 'session token rejected');
      throw unauthorized('Session token is invalid or expired');
    }

    const user = await resolveUser(claims.sub);
    c.set('user', user);
    c.var.log.setBindings({ userId: user.id });
    await next();
  };
}
