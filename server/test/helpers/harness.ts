import { randomUUID } from 'node:crypto';

import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { Webhook } from 'svix';

import { loadConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/lib/logger.js';
import type { MediaStore } from '../../src/media/store.js';
import { createDeps, startServer } from '../../src/server.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './env.js';

/**
 * Starts the real server (real Postgres, real Redis, real HTTP on a random
 * port) the same way production does. Only the token signer differs: tokens
 * are signed with a key made here, and the server verifies them with Clerk's
 * own `verifyToken`, given that key's public half as CLERK_JWT_KEY.
 */
const signingKeys = await generateKeyPair('RS256', { extractable: true });
const otherKeys = await generateKeyPair('RS256');
export const publicPem = await exportSPKI(signingKeys.publicKey);

export const WEBHOOK_SECRET = `whsec_${Buffer.from('octolearn-e2e-webhook-signing-key').toString('base64')}`;
export const METRICS_TOKEN = 'e2e-metrics-token-0123456789';
export const WEB_ORIGIN = 'https://admin.octolearn.test';

export const newClerkId = () => `user_${randomUUID().replaceAll('-', '')}`;

export async function sessionToken(
  subject: string,
  options: { expiresInSec?: number; foreignKey?: boolean; azp?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: `sess_${subject}`, ...(options.azp ? { azp: options.azp } : {}) })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'e2e' })
    .setSubject(subject)
    .setIssuer('https://e2e.clerk.accounts.dev')
    .setIssuedAt(now - 10)
    .setNotBefore(now - 10)
    .setExpirationTime(now + (options.expiresInSec ?? 300))
    .sign(options.foreignKey ? otherKeys.privateKey : signingKeys.privateKey);
}

export function signWebhook(payload: unknown, at = new Date()) {
  const body = JSON.stringify(payload);
  const id = `msg_${randomUUID()}`;
  const signature = new Webhook(WEBHOOK_SECRET).sign(id, at, body);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(at.getTime() / 1000)),
      'svix-signature': signature,
    },
  };
}

export type Reply<T = unknown> = { status: number; headers: Headers; body: T };

export async function startTestApp(
  env: Record<string, string> = {},
  options: { clock?: () => Date; media?: MediaStore | null } = {},
) {
  const config = loadConfig({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '0',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    CLERK_JWT_KEY: publicPem,
    CLERK_WEBHOOK_SIGNING_SECRET: WEBHOOK_SECRET,
    METRICS_TOKEN,
    CORS_ORIGINS: WEB_ORIGIN,
    RATE_LIMIT_MAX: '1000000',
    RATE_LIMIT_USER_MAX: '1000000',
    ...env,
  });
  const logger = createLogger({ level: config.LOG_LEVEL, service: 'e2e', release: 'test' });
  const deps = await createDeps(config, logger, {
    clock: options.clock,
    // No bucket in tests unless a test brings its own store.
    media: options.media ?? null,
  });
  const running = await startServer(deps);

  /** fetch + JSON parse; `token` becomes the Bearer header. */
  async function call<T = any>(
    path: string,
    init: {
      method?: string;
      token?: string;
      json?: unknown;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<Reply<T>> {
    const headers: Record<string, string> = { ...init.headers };
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    if (init.json !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${running.url}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (metrics, docs page): keep the text.
    }
    return { status: response.status, headers: response.headers, body: body as T };
  }

  /** A brand-new learner and a token for them. */
  async function newLearner() {
    const clerkId = newClerkId();
    const token = await sessionToken(clerkId);
    const me = await call('/v1/me', { token });
    return { clerkId, token, id: me.body.data.id as string };
  }

  return {
    url: running.url,
    deps,
    running,
    call,
    newLearner,
    close: () => running.shutdown('test finished'),
  };
}

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;
