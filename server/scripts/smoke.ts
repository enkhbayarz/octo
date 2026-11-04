/**
 * Smoke test for a deployed API (Railway or local). Read-only checks run
 * always; learner checks run with a Clerk TOKEN; ops checks with METRICS_TOKEN.
 *
 *   BASE_URL=https://api-production-xxxx.up.railway.app \
 *   TOKEN=$(bun run --silent clerk-token) METRICS_TOKEN=... bun run smoke
 *
 * The learner checks write real progress for the token's user (lesson u1-l1..l5
 * and one quiz attempt). Exits 1 if anything fails.
 */
import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TOKEN?.trim();
const metricsToken = process.env.METRICS_TOKEN?.trim();

let failures = 0;
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function call(path: string, init: RequestInit & { auth?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.auth) headers.set('authorization', `Bearer ${init.auth}`);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  return { status: response.status, headers: response.headers, body };
}

console.log(`Smoke testing ${baseUrl}\n\nPublic`);
await check('liveness', async () => {
  const { status } = await call('/health/live');
  expect(status === 200, `status ${status}`);
});
await check('readiness: Postgres and Redis both ok', async () => {
  const { status, body } = await call('/health/ready');
  expect(status === 200, `status ${status}: ${JSON.stringify(body)}`);
  expect(body.data.status === 'ok', `degraded: ${JSON.stringify(body.data.checks)}`);
});
await check('course list and full course (2 units, 10 lessons)', async () => {
  const list = await call('/v1/courses');
  expect(list.body.data?.[0]?.id === 'english-a1', 'english-a1 not listed (did the seed run?)');
  const { body } = await call('/v1/courses/english-a1');
  const lessons = body.data.units.flatMap((unit: any) => unit.lessons);
  expect(body.data.units.length === 2 && lessons.length === 10, 'unexpected course shape');
});
await check('ETag → 304 Not Modified', async () => {
  const first = await call('/v1/courses/english-a1');
  const etag = first.headers.get('etag');
  expect(etag, 'no ETag header');
  const again = await call('/v1/courses/english-a1', { headers: { 'if-none-match': etag } });
  expect(again.status === 304, `status ${again.status}`);
});
await check('errors use the envelope and carry the request id', async () => {
  const { status, body, headers } = await call('/v1/nope');
  expect(status === 404 && body.error?.code === 'NOT_FOUND', `status ${status}`);
  expect(body.error.requestId === headers.get('x-request-id'), 'request id mismatch');
});
await check('security headers', async () => {
  const { headers } = await call('/health/live');
  expect(headers.get('x-content-type-options') === 'nosniff', 'missing nosniff');
  expect(headers.get('strict-transport-security'), 'missing HSTS');
});
await check('signed-in routes refuse anonymous calls', async () => {
  const { status } = await call('/v1/me');
  expect(status === 401, `status ${status}`);
});
await check('OpenAPI document and /docs', async () => {
  const doc = await call('/openapi.json');
  expect(doc.status === 200 && doc.body.openapi === '3.1.0', `status ${doc.status}`);
  expect((await call('/docs')).status === 200, '/docs not served');
});

if (token) {
  console.log('\nLearner (writes progress for the TOKEN user)');
  await check('profile (created on first call) and name update', async () => {
    const me = await call('/v1/me', { auth: token });
    expect(me.status === 200, `status ${me.status}: ${JSON.stringify(me.body)}`);
    const patched = await call('/v1/me', {
      method: 'PATCH',
      auth: token,
      body: JSON.stringify({ displayName: 'Smoke Tester' }),
    });
    expect(patched.body.data?.displayName === 'Smoke Tester', JSON.stringify(patched.body));
  });
  await check('complete unit 1 lessons; repeating one is idempotent', async () => {
    for (const id of ['u1-l1', 'u1-l2', 'u1-l3', 'u1-l4', 'u1-l5']) {
      const { status } = await call(`/v1/me/lessons/${id}/complete`, {
        method: 'POST',
        auth: token,
      });
      expect(status === 200, `${id}: status ${status}`);
    }
    const again = await call('/v1/me/lessons/u1-l1/complete', { method: 'POST', auth: token });
    expect(
      again.body.data.alreadyCompleted === true && again.body.data.xpGained === 0,
      'not idempotent',
    );
  });
  await check('quiz attempt is graded and replayed for the same Idempotency-Key', async () => {
    const { body: course } = await call('/v1/courses/english-a1');
    const answers = course.data.units[0].quiz.questions.map(
      (question: any) => question.answerIndex,
    );
    const key = randomUUID();
    const submit = () =>
      call('/v1/me/quizzes/u1-quiz/attempts', {
        method: 'POST',
        auth: token,
        headers: { 'idempotency-key': key },
        body: JSON.stringify({ answers }),
      });
    const first = await submit();
    expect(first.status === 201 && first.body.data.passed === true, JSON.stringify(first.body));
    const retry = await submit();
    expect(retry.headers.get('idempotent-replayed') === 'true', 'retry was not replayed');
    expect(
      retry.body.data.attemptId === first.body.data.attemptId,
      'retry recorded a second attempt',
    );
  });
  await check('progress and weekly leaderboard include the learner', async () => {
    const progress = await call('/v1/me/progress', { auth: token });
    expect(progress.body.data.completedLessons.length >= 5, 'lessons missing from progress');
    const board = await call('/v1/leaderboard/weekly', { auth: token });
    expect(board.body.data.me?.xp > 0, `not ranked: ${JSON.stringify(board.body.data.me)}`);
  });
} else {
  console.log('\n(skipping learner checks: set TOKEN)');
}

if (metricsToken) {
  console.log('\nOperations');
  await check('Prometheus metrics', async () => {
    const { status, body } = await call('/metrics', { auth: metricsToken });
    expect(
      status === 200 && String(body).includes('http_request_duration_seconds'),
      `status ${status}`,
    );
  });
  await check('runtime stats (CPU, memory, event loop, pool)', async () => {
    const { status, body } = await call('/internal/stats', { auth: metricsToken });
    expect(status === 200, `status ${status}`);
    const { cpu, memory, eventLoop, databasePool } = body.data;
    console.log(
      `      CPU ${cpu.percent}% · RSS ${memory.rssMb} MB · loop p99 ${eventLoop.delayP99Ms} ms · pool ${databasePool.total}/${databasePool.max}`,
    );
  });
} else {
  console.log('\n(skipping ops checks: set METRICS_TOKEN)');
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
