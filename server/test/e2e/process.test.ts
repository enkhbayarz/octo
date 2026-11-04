import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { TEST_DATABASE_URL, TEST_REDIS_URL } from '../helpers/env.js';
import { newClerkId, publicPem, sessionToken } from '../helpers/harness.js';

/**
 * The production artifact, run the way Railway runs it: `node --import
 * ./dist/instrumentation.js dist/index.js`, plus the pre-deploy CLIs.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const baseEnv = {
  PATH: process.env.PATH!,
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '0',
  LOG_LEVEL: 'info',
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  CLERK_JWT_KEY: publicPem,
};

function run(args: string[], env: Record<string, string>) {
  const child = spawn('node', args, { cwd: root, env });
  const output: string[] = [];
  const collect = (chunk: Buffer) => output.push(...chunk.toString().split('\n').filter(Boolean));
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const exited = once(child, 'exit') as Promise<[number | null]>;
  return { child, output, exited };
}

async function waitFor<T>(check: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const logs = (output: string[]) =>
  output.flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });

beforeAll(() => {
  execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], { cwd: root });
}, 120_000);

describe('pre-deploy commands', () => {
  test('migrate is safe to re-run', async () => {
    const { output, exited } = run(['dist/db/migrate.js'], baseEnv);
    expect((await exited)[0]).toBe(0);
    expect(output).toContain('migrations applied');
  });

  test('seed upserts the course', async () => {
    const { output, exited } = run(['dist/db/seed.js'], baseEnv);
    expect((await exited)[0]).toBe(0);
    expect(output).toContain('seeded english-a1: 2 units, 10 lessons, 10 questions');
  });
});

describe('the server process', () => {
  let collector: Server;
  const spans: { name: string; attributes: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    // A stand-in for Railway's OTLP receiver.
    collector = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        const payload = JSON.parse(body) as {
          resourceSpans: {
            scopeSpans: {
              spans: { name: string; attributes: { key: string; value: unknown }[] }[];
            }[];
          }[];
        };
        for (const resource of payload.resourceSpans)
          for (const scope of resource.scopeSpans)
            for (const span of scope.spans)
              spans.push({
                name: span.name,
                attributes: Object.fromEntries(
                  span.attributes.map((attr) => [attr.key, attr.value]),
                ),
              });
        response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    }).listen(0, '127.0.0.1');
    await once(collector, 'listening');
  });
  afterAll(() => collector.close());

  test('fails fast with a readable message when configuration is missing', async () => {
    const { output, exited } = run(['dist/index.js'], { PATH: process.env.PATH! });
    expect((await exited)[0]).toBe(1);
    expect(output.join('\n')).toMatch(/Invalid environment[\s\S]*DATABASE_URL/);
  });

  test('serves traffic, exports traces, and shuts down cleanly on SIGTERM', async () => {
    const { port } = collector.address() as AddressInfo;
    const server = run(['--import', './dist/instrumentation.js', 'dist/index.js'], {
      ...baseEnv,
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_SERVICE_NAME: 'octolearn-api-e2e',
      OTEL_BSP_SCHEDULE_DELAY: '100',
    });
    let child: ChildProcess | undefined = server.child;
    try {
      const url = await waitFor(
        () =>
          logs(server.output).find((line) => line.message === 'octolearn api listening')?.url as
            string | undefined,
      );

      const token = await sessionToken(newClerkId());
      expect((await fetch(`${url}/v1/courses/english-a1`)).status).toBe(200);
      expect(
        (await fetch(`${url}/v1/me/progress`, { headers: { authorization: `Bearer ${token}` } }))
          .status,
      ).toBe(200);

      // HTTP server spans are named after the route; pg and ioredis calls are child spans.
      await waitFor(() =>
        spans.some((span) => span.name === 'GET /v1/me/progress') ? true : undefined,
      );
      expect(spans.map((span) => span.name)).toContain('GET /v1/courses/:courseId');
      expect(spans.some((span) => /^pg\./.test(span.name))).toBe(true);
      expect(spans.some((span) => ['get', 'evalsha', 'eval'].includes(span.name))).toBe(true);

      // Every request log line carries the trace id, linking logs to traces.
      const requestLog = logs(server.output).find((line) => line.route === '/v1/me/progress');
      expect(requestLog).toMatchObject({
        level: 'info',
        status: 200,
        trace_id: expect.any(String),
      });

      server.child.kill('SIGTERM');
      const [code] = await server.exited;
      child = undefined;
      expect(code).toBe(0);
      expect(logs(server.output).map((line) => line.message)).toEqual(
        expect.arrayContaining(['shutting down: draining in-flight requests', 'shutdown complete']),
      );
    } finally {
      child?.kill('SIGKILL');
    }
  });
});
