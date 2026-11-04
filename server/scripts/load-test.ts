/**
 * How much load can one instance take? Ramps concurrent connections per
 * endpoint and prints throughput, latency percentiles and errors.
 *
 *   BASE_URL=http://127.0.0.1:3000 TOKEN=$(bun run --silent token) bun run load
 *
 * Options (env): CONNECTIONS=10,50,100,250  DURATION=10 (seconds per step)
 *                ONLY=1,3 (scenario numbers, in the order listed below)
 * Run it against a server started with high RATE_LIMIT_MAX/RATE_LIMIT_USER_MAX,
 * or the rate limiter (correctly) answers most requests with 429.
 */
import autocannon from 'autocannon';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const token = process.env.TOKEN?.trim();
const duration = Number(process.env.DURATION ?? 10);
const levels = (process.env.CONNECTIONS ?? '10,50,100,250').split(',').map(Number);
const metricsToken = process.env.METRICS_TOKEN;

type Scenario = {
  name: string;
  path: string;
  auth?: boolean;
  method?: 'GET' | 'PUT' | 'POST';
  body?: unknown;
};

const only = process.env.ONLY?.split(',');
const allScenarios: Scenario[] = [
  { name: 'GET /health/live (no I/O)', path: '/health/live' },
  { name: 'GET /v1/courses/:id (Redis cache)', path: '/v1/courses/english-a1' },
  { name: 'GET /v1/me/progress (auth + 6 queries)', path: '/v1/me/progress', auth: true },
  { name: 'GET /v1/leaderboard/weekly (auth + zset)', path: '/v1/leaderboard/weekly', auth: true },
  {
    name: 'PUT video-progress (upsert, no lock)',
    path: '/v1/me/lessons/u1-l2/video-progress',
    auth: true,
    method: 'PUT',
    body: { positionSec: 4, furthestSec: 6 },
  },
  {
    // Worst case on purpose: every request locks the same learner row, so they run one at a time.
    name: 'POST lesson complete (one learner, row lock)',
    path: '/v1/me/lessons/u1-l1/complete',
    auth: true,
    method: 'POST',
  },
];

type Row = {
  scenario: string;
  connections: number;
  rps: number;
  p50: number;
  p99: number;
  ok: string;
};

async function stats() {
  const response = await fetch(`${baseUrl}/internal/stats`, {
    headers: metricsToken ? { authorization: `Bearer ${metricsToken}` } : {},
  }).catch(() => null);
  if (!response?.ok) return null;
  const { data } = (await response.json()) as {
    data: {
      cpu: { percent: number };
      memory: { rssMb: number };
      eventLoop: { delayP99Ms: number };
    };
  };
  return data;
}

const scenarios = only
  ? allScenarios.filter((_, index) => only.includes(String(index + 1)))
  : allScenarios;

const rows: Row[] = [];
for (const scenario of scenarios) {
  if (scenario.auth && !token) {
    console.log(`skipping "${scenario.name}": set TOKEN`);
    continue;
  }
  for (const connections of levels) {
    const result = await autocannon({
      url: `${baseUrl}${scenario.path}`,
      connections,
      duration,
      method: scenario.method ?? 'GET',
      headers: {
        ...(scenario.auth ? { authorization: `Bearer ${token}` } : {}),
        ...(scenario.body ? { 'content-type': 'application/json' } : {}),
      },
      body: scenario.body ? JSON.stringify(scenario.body) : undefined,
    });
    const total = result.requests.total;
    const good = result['2xx'];
    rows.push({
      scenario: scenario.name,
      connections,
      rps: Math.round(result.requests.average),
      p50: result.latency.p50,
      p99: result.latency.p99,
      ok: `${((good / Math.max(total, 1)) * 100).toFixed(1)}%`,
    });
    console.log(rows.at(-1));
  }
}

console.log('\n| Endpoint | Connections | Req/s | p50 ms | p99 ms | 2xx |');
console.log('|---|---:|---:|---:|---:|---:|');
for (const row of rows) {
  console.log(
    `| ${row.scenario} | ${row.connections} | ${row.rps} | ${row.p50} | ${row.p99} | ${row.ok} |`,
  );
}
const after = await stats();
if (after) {
  console.log(
    `\nServer after the run: CPU ${after.cpu.percent}% · RSS ${after.memory.rssMb} MB · event-loop p99 ${after.eventLoop.delayP99Ms} ms`,
  );
}
