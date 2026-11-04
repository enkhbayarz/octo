import { describe, expect, test } from 'vitest';

import { ConfigError, loadConfig } from './env.js';

const minimal = {
  DATABASE_URL: 'postgres://u@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  CLERK_JWT_KEY: 'pem',
};

describe('loadConfig', () => {
  test('fills safe defaults', () => {
    const config = loadConfig(minimal);
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_POOL_MAX: 10,
      TRUST_PROXY: false,
      CORS_ORIGINS: [],
      RELEASE: 'dev',
    });
  });

  test('parses lists, flags and numbers from strings', () => {
    const config = loadConfig({
      ...minimal,
      CORS_ORIGINS: 'https://a.test, https://b.test,,',
      TRUST_PROXY: 'true',
      PORT: '8080',
    });
    expect(config.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.PORT).toBe(8080);
  });

  test("takes the release from Railway's commit sha and unescapes PEM newlines", () => {
    const config = loadConfig({
      ...minimal,
      RAILWAY_GIT_COMMIT_SHA: 'abcdef123456',
      CLERK_JWT_KEY: 'a\\nb',
    });
    expect(config.RELEASE).toBe('abcdef1');
    expect(config.CLERK_JWT_KEY).toBe('a\nb');
  });

  test('treats empty variables as unset', () => {
    const config = loadConfig({ ...minimal, METRICS_TOKEN: '', PORT: '' });
    expect(config.METRICS_TOKEN).toBeUndefined();
    expect(config.PORT).toBe(3000);
  });

  test('needs a way to verify Clerk tokens', () => {
    expect(() => loadConfig({ ...minimal, CLERK_JWT_KEY: undefined })).toThrow(/CLERK_JWT_KEY/);
    expect(
      loadConfig({ ...minimal, CLERK_JWT_KEY: undefined, CLERK_SECRET_KEY: 'sk_test' })
        .CLERK_SECRET_KEY,
    ).toBe('sk_test');
  });

  test('lists every invalid variable at once', () => {
    try {
      loadConfig({ DATABASE_URL: 'nope', PORT: 'x' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toMatch(/DATABASE_URL/);
      expect((error as Error).message).toMatch(/REDIS_URL/);
      expect((error as Error).message).toMatch(/PORT/);
    }
  });
});
