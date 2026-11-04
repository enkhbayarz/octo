# Octolearn API

The backend for the Octolearn app: course content, learner progress and a weekly leaderboard. It is built for a mobile app today and for a web client and an admin dashboard later.

**Stack:** Node 24 · Hono and `@hono/zod-openapi` · Zod 4 · Drizzle ORM · PostgreSQL · Redis (ioredis) · Clerk · pino · Prometheus metrics · OpenTelemetry · Vitest. Deployed on Railway.

```
server/
├── src/
│   ├── index.ts              entry: config → deps → listen, signals, graceful shutdown
│   ├── instrumentation.ts    OpenTelemetry (loaded with node --import, off without an OTLP endpoint)
│   ├── server.ts             composition root: pool, Redis, metrics → startServer/shutdown
│   ├── app.ts                middleware order + routes (no I/O of its own, so tests build it for real)
│   ├── config/env.ts         every env var, validated with Zod at startup
│   ├── db/                   Drizzle schema, pool, transactions with retry, migrate + seed CLIs
│   ├── cache/                Redis client (fail-fast), read-through cache with single-flight
│   ├── http/                 context types, error envelope, router factory, middleware
│   │   └── middleware/       auth (Clerk), rate-limit, load-shed, observe (logs + metrics)
│   ├── modules/              one folder per feature: *.routes.ts → *.service.ts (+ schemas, rules)
│   │   ├── course/  progress/  leaderboard/  users/  webhooks/  health/  system/
│   ├── jobs/cleanup.ts       hourly housekeeping behind a Postgres advisory lock
│   ├── observability/        Prometheus registry, CPU / memory / event-loop stats
│   └── lib/                  errors, logger, retry with backoff + jitter, dates
├── drizzle/                  generated SQL migrations (committed, reviewed like code)
├── test/e2e/                 HTTP tests against real Postgres + Redis, plus child-process tests
├── scripts/                  smoke test, load test, EXPLAIN ANALYZE, token helpers
├── Dockerfile               built by Railway (deploy settings live on the service, see below)
```

## API

Every success is `{ "data": … }`. Every failure is `{ "error": { "code", "message", "details"?, "requestId" } }`. Clients branch on `code`. Validation failures list each bad field in `details`. Unknown errors never leak their message. The interactive reference is at **`/docs`**, and the OpenAPI 3.1 document is at **`/openapi.json`**: generate the web or admin client from it.

| Method | Path                                      | Auth                      | What                                                                         |
| ------ | ----------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/v1/courses`                             | –                         | Published courses with unit and lesson counts                                |
| GET    | `/v1/courses/:courseId`                   | –                         | Full course: units → lessons + quiz (the brief's shape). Supports ETag/304   |
| GET    | `/v1/me`                                  | Clerk                     | Profile (the learner row is created on the first call)                       |
| PATCH  | `/v1/me`                                  | Clerk                     | Name, time zone, onboarding answers                                          |
| GET    | `/v1/me/progress`                         | Clerk                     | Completed lessons, quiz results, XP, streak, 7-day activity, video positions |
| POST   | `/v1/me/lessons/:lessonId/complete`       | Clerk                     | Mark watched. Naturally idempotent: +10 XP only once                         |
| PUT    | `/v1/me/lessons/:lessonId/video-progress` | Clerk                     | Resume point. `furthest` only grows                                          |
| POST   | `/v1/me/quizzes/:quizId/attempts`         | Clerk + `Idempotency-Key` | Graded on the server. +20 XP on the first pass                               |
| GET    | `/v1/leaderboard/weekly?limit=20`         | Clerk                     | XP this ISO week (UTC) plus your own rank                                    |
| POST   | `/webhooks/clerk`                         | Svix signature            | `user.created` / `updated` / `deleted`                                       |
| GET    | `/health/live`, `/health/ready`           | –                         | Liveness; readiness (Postgres required, Redis optional)                      |
| GET    | `/metrics`, `/internal/stats`             | `METRICS_TOKEN`           | Prometheus; human-readable CPU / RAM / event loop / pool                     |

Locked items return `409 ITEM_LOCKED`. The server enforces the same "finish the previous item first" rule as the app, so the leaderboard can't be farmed.

## Run locally (no Docker)

You need Postgres 16+ and Redis 7+ running somewhere, e.g. Homebrew, or Railway's public URLs.

```bash
cd server
bun install
cp .env.example .env              # fill DATABASE_URL, REDIS_URL, CLERK_JWT_KEY
bun run db:migrate && bun run db:seed
bun run dev                       # http://localhost:3000/docs
```

There are two ways to authenticate locally:

- **Without Clerk:**
  - Run `bun run token -- --public-key` and put the printed key in `CLERK_JWT_KEY`.
  - Then `bun run --silent token -- user_me` prints a Bearer token.
- **With Clerk:** use the real `CLERK_JWT_KEY` and `bun run --silent clerk-token`. See below.

## Tests

```bash
TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/octolearn_test \
TEST_REDIS_URL=redis://127.0.0.1:6379/1 \
bun run check        # typecheck + lint + format + all tests
bun run coverage
```

The e2e suite drops and recreates the `*_test` database, and flushes that Redis db, on every run. The database name must end in `_test`. No mocks for Postgres, Redis or HTTP: tests boot the real server on a random port.

**Unit tests** cover the pure rules: streaks across time zones, quiz grading, the unlock path, ISO weeks, backoff, the config schema and error mapping.

**E2E tests** cover:

- auth: forged, expired, wrong `azp`, and races on first sign-in
- validation and the error envelope
- ETag/304, cache stampedes, and cache invalidation
- idempotency (replays, concurrent retries, key reuse)
- race conditions on XP
- streaks across time zones, and the 24-hour clean-up job
- the leaderboard: rebuilds, drift healing, a corrupted key, and the Redis-down fallback
- Clerk webhooks: signature, staleness, out-of-order delivery, cascade delete
- rate limits and spoofed proxy headers
- load shedding, timeouts, `lock_timeout`
- Postgres down and Redis down
- graceful shutdown
- a real `SERIALIZABLE` write-skew retry
- database constraints

**Process tests** run the built server as a child process:

- the migrate and seed CLIs
- that bad config fails fast
- that OpenTelemetry exports route-named HTTP spans with pg and Redis child spans
- that logs carry `trace_id`
- that SIGTERM drains and exits 0

Current result: **173 tests passing**, with 99.86% line, 99.16% statement and 95.1% branch coverage. Coverage leaves out `index.ts`, `instrumentation.ts` and the CLI `main` blocks, which only the process tests reach, plus the schema declarations. What's left uncovered is defensive guards for states that can't be reproduced, such as a row vanishing between two statements in a transaction.

## Deploy to Railway

These are commands for you to run. The service name `api` and the database names `Postgres` / `Redis` are what the variable references below expect.

```bash
# 0. CLI ≥ 5.62 and the agent skill (already installed here)
brew upgrade railway && railway skills install --agent claude-code

# 1. Project + databases (from the repo root)
railway login
railway init --name octolearn
railway add --database postgres --json
railway add --database redis --json
railway add --service api --json

# 2. Variables for the API (references resolve to the private network)
railway variable set --service api \
  'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  'REDIS_URL=${{Redis.REDIS_URL}}' \
  NODE_ENV=production TRUST_PROXY=true \
  METRICS_TOKEN=$(openssl rand -hex 24) \
  CORS_ORIGINS=http://localhost:5173
# Clerk public key (multi-line PEM, read from stdin):
railway variable set CLERK_JWT_KEY --stdin --service api < clerk-public.pem
# Optional, after step 5: CLERK_WEBHOOK_SIGNING_SECRET=whsec_...

# 3. Build + deploy settings on the service (railway.json is deprecated: Railway ignores its
#    deploy section for new services and stops reading it on 2026-12-01)
railway environment edit --json <<'JSON'
{"services":{"<api-service-id>":{
  "build":{"builder":"DOCKERFILE","dockerfilePath":"Dockerfile"},
  "deploy":{"preDeployCommand":"npm run predeploy","healthcheckPath":"/health/ready",
            "healthcheckTimeout":60,"restartPolicyType":"ON_FAILURE","restartPolicyMaxRetries":5}}}}
JSON
railway variable set --service api RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15 RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=10

# 4. Deploy only the server/ folder
railway up ./server --path-as-root --service api --detach -m "octolearn api"

# 5. Public URL, logs
railway domain --service api --json
railway logs --service api --lines 100
```

What happens on each deploy, from those service settings:

1. Railway builds the `Dockerfile`: bun installs, TypeScript compiles, and the runtime is a plain `node:24-slim` image running as a non-root user.
2. It runs the **pre-deploy** step (`npm run predeploy`), `migrate` then `seed`. Both are idempotent, and the migration takes an advisory lock.
3. It starts the new version and waits for **`/health/ready`** before moving traffic over.
4. It sends **SIGTERM** to the old version, which has **15s to drain** before it is killed.

**Optional, all in the Railway dashboard:**

- **Tracing:**
  - Run `railway trace enable --service api`, then `railway redeploy --service api --yes`.
  - Spans appear in the project's Traces tab, joined to Railway's edge spans.
  - Use the SDK path, not "automatic instrumentation", or every span shows up twice.
- **Redis eviction:**
  - Everything in Redis can be rebuilt from Postgres, so `allkeys-lru` is the right policy.
  - Run `railway connect Redis`, then `CONFIG SET maxmemory-policy allkeys-lru`.
  - That lasts until Redis restarts. To make it permanent, add `--maxmemory-policy allkeys-lru` to the Redis service's start command.
- **Replicas:** set `numReplicas` in the service settings. The app is stateless: rate limits, caches and the leaderboard live in Redis, and jobs are guarded by advisory locks.

### Clerk (development instance)

1. Create an application at dashboard.clerk.com and enable **Email**, **Username**, **Google** and **Apple** under _User & Authentication_. Development instances come with Clerk's shared OAuth credentials, so nothing else is needed for testing. Native "Sign in with Apple" on iOS and production instances need your own Google/Apple credentials later.
2. Go to _API Keys_, then **Show JWT public key**, then **PEM**. Save it as `clerk-public.pem` and set `CLERK_JWT_KEY` (step 2 above). The API then verifies tokens offline.
3. Go to _Webhooks_. Add the endpoint `https://<your-domain>/webhooks/clerk` with the events `user.created`, `user.updated` and `user.deleted`, then copy the signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.
4. Later, in the Expo app, send `Authorization: Bearer ${await getToken()}` on every request.

### Test it on Railway

```bash
cd server
BASE=https://<your-domain>
TOKEN=$(CLERK_SECRET_KEY=sk_test_... bun run --silent clerk-token -- you@example.com)

BASE_URL=$BASE TOKEN=$TOKEN METRICS_TOKEN=<from step 2> bun run smoke   # 14 checks, exit 1 on failure
BASE_URL=$BASE TOKEN=$TOKEN METRICS_TOKEN=<…> bun run load               # throughput / latency table
```

`clerk-token` creates (or reuses) a test user in your **development** instance and prints a one-hour token.

Before running `load`, raise the limits for the duration with `railway variable set --service api RATE_LIMIT_MAX=1000000000 RATE_LIMIT_USER_MAX=1000000000`, then set them back. Otherwise the rate limiter will (correctly) answer most requests with 429.

## Observability

- **Logs:**
  - One JSON line per request: `level`, `message`, `requestId`, `userId`, `route` (the pattern, not the raw path), `status` and `durationMs`.
  - Plus `trace_id` when tracing is on.
  - Secrets and auth headers are redacted.
  - Railway's log explorer indexes `level` and `message`, so `@level:error` works.
- **Request id:** `X-Request-Id` is echoed on every response and appears in every error body, so a user report maps straight to the log line.
- **`/metrics`** (Prometheus):
  - request latency histograms by route and status
  - in-flight requests, load-shed and rate-limited counters
  - cache hits, misses and errors, plus `cache_loads_total` (Postgres rebuilds)
  - DB pool total, idle and waiting
  - CPU, memory, heap, GC, event-loop lag
- **`/internal/stats`:** the same at a glance: CPU %, RSS and heap, event-loop delay p50/p99 and utilization over the last 5s, in-flight requests, pool usage.
- **Railway** also graphs CPU, RAM and network per service.

## Load test (one instance)

Measured on an Apple M2 Pro with Postgres 16 and Redis 8 on the same machine. The server ran as a production build with `info` logging, i.e. one log line per request, and rate limits raised. Each step ran for 8 seconds. Railway's shared vCPUs will be slower; rerun `bun run load` there for real numbers.

| Endpoint                                              | Connections |  Req/s | p50 ms | p99 ms |  2xx |
| ----------------------------------------------------- | ----------: | -----: | -----: | -----: | ---: |
| `GET /health/live` (no I/O)                           |         100 | 17,131 |      5 |      7 | 100% |
| `GET /v1/courses/:id` (Redis cache)                   |         100 |  6,272 |     15 |     17 | 100% |
| `GET /v1/courses/:id`                                 |         250 |  5,528 |     45 |    137 | 100% |
| `GET /v1/leaderboard/weekly` (auth + zset)            |         100 |  3,416 |     28 |     37 | 100% |
| `PUT …/video-progress` (upsert)                       |         100 |  2,232 |     43 |     66 | 100% |
| `GET /v1/me/progress` (auth + 6 queries)              |          10 |  1,888 |      5 |      7 | 100% |
| `GET /v1/me/progress`                                 |         250 |  1,783 |    136 |    278 | 100% |
| `POST …/complete` (one learner, row lock, worst case) |         250 |  1,443 |    171 |    351 | 100% |

The full run is 18 steps and about 353k requests. Every response was a 200, with zero errors.

**Reading it:**

- **Where the ceiling is:** throughput plateaus once the 10-connection DB pool is saturated, at roughly 1.8k req/s for the heaviest read and 2.2k for writes. Beyond that, more connections only add queueing latency.
- **What one instance means in users:** at small scale that's plenty. 1,000 learners active at the same moment, each making a request every 5 seconds, is about 200 req/s.
- **Memory:** about 170 MB idle and about 310–350 MB under load. It peaks briefly during bursts, then returns.
- **Past capacity:** at 1,000 connections, everything beyond `MAX_IN_FLIGHT` (256) gets an instant, cheap `503 + Retry-After`, about 40k per second, instead of queueing. The in-process limiter can't save an instance from a client that ignores `Retry-After`, though. That's the job of more replicas (horizontal scaling) and the edge.
- **Bugs this test found and fixed:**
  - Pool timeouts arrived wrapped inside Drizzle errors and were returned as 500 instead of 503.
  - Shedding a request was expensive: it went through logging and the error handler. It now runs first.
  - There was no `lock_timeout`, so writes queued on one row could hold every pooled connection.
  - The event-loop stats reported an average since boot instead of the last window.

## The 50 concepts: what's used here, and why

We're small: one region, one or two instances, thousands of learners rather than millions. The rule is to use a technique when its failure mode would actually hit us, and to name the trigger for the rest.

**Used**

| #      | Concept                              | Where / how                                                                                                                                                                                         | Why                                                                                                                      |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1      | Race conditions                      | 10 concurrent "complete lesson" calls award XP once; 10 first sign-ins create one row; tests prove both                                                                                             | Phones retry and double-tap; two devices sync at once                                                                    |
| 2      | Deadlocks                            | Every progress transaction locks the learner's `users` row **first**, so locks are always taken in one order. `40P01` is retried anyway                                                             | Opposite lock orders are how deadlocks happen; one order makes them impossible                                           |
| 3      | Transactions                         | Completing a lesson writes a completion, an XP event, totals and video progress in one transaction                                                                                                  | All-or-nothing: no XP without the completion, or the reverse                                                             |
| 4      | ACID                                 | Postgres provides it; FK, unique and check constraints make "consistent" enforceable                                                                                                                | Progress is the product; it must survive crashes                                                                         |
| 5      | Isolation levels                     | Writes: READ COMMITTED plus a row lock. `GET /me/progress`: REPEATABLE READ READ ONLY, so totals and lists come from one snapshot. A SERIALIZABLE write-skew test shows the retry                   | Pick the cheapest level that's correct per query                                                                         |
| 7      | Pessimistic locking                  | `SELECT … FOR UPDATE` on the learner row; `lock_timeout` 3s                                                                                                                                         | Read-modify-write of XP and streak; contention is per learner, so it's tiny                                              |
| 6      | Optimistic locking                   | Prepared: `version` columns on all content tables                                                                                                                                                   | The admin dashboard: two editors, low contention, long think time, so check the version instead of locking               |
| 8      | Connection pooling                   | `pg.Pool` max 10, 5s acquire timeout, 30-minute recycling, statement and idle-in-transaction timeouts, pool metrics                                                                                 | Railway Postgres allows 100 connections; `replicas × 10` leaves headroom                                                 |
| 9      | N+1 queries                          | The course tree takes 5 queries total, not 1 + units + quizzes; leaderboard names come from one `IN (…)` query                                                                                      | The classic ORM trap; the fix is one query per table                                                                     |
| 10     | Indexes                              | Unique `clerk_user_id`; `(created_at, user_id, amount)` for the weekly board; `(user_id, day)` for activity; composite primary keys for per-learner rows                                            | Each hot query has its index; EXPLAIN confirms it                                                                        |
| 11–12  | Query optimization, EXPLAIN ANALYZE  | `bun run db:explain` loads 20k learners and 400k events in a rolled-back transaction and plans the hot queries                                                                                      | Small tables lie (seq scans); measure at realistic volume. Learner lookup 0.01 ms, board rebuild 12 ms, activity 0.05 ms |
| 13     | Foreign keys                         | CASCADE from user to progress (account deletion); RESTRICT from content to progress (archive, never delete learned content)                                                                         | Integrity can't depend on application code                                                                               |
| 14     | Unique constraints                   | One user per Clerk id, one completion per lesson, one quiz per unit, one idempotency key per learner                                                                                                | They turn races into harmless no-ops                                                                                     |
| 15     | Migrations                           | Drizzle generates reviewed SQL in `drizzle/`; it runs in Railway's pre-deploy step under an advisory lock                                                                                           | Schema changes are versioned and run once, before the new code                                                           |
| 16     | Zero-downtime migrations             | Pre-deploy migration, plus a readiness gate, plus `overlapSeconds`. Rule: **expand → deploy → contract** (add a nullable column, ship code using it, drop the old one later; never rename in place) | Old and new code overlap for a few seconds during every deploy                                                           |
| 21     | Cache invalidation                   | Explicit: the seed step deletes course keys. The TTL bounds staleness if a delete is missed. Not-found is never cached                                                                              | Content changes rarely and predictably                                                                                   |
| 22     | Redis eviction                       | Nothing in Redis is the only copy, so `allkeys-lru` is safe; idempotency lives in Postgres for that reason                                                                                          | Under memory pressure Redis evicts, and we lose nothing                                                                  |
| 23     | Cache stampedes                      | Single-flight in-process (25 cold reads → 1 query, tested). The leaderboard rebuild takes a Redis lock (20 reads → 1 rebuild, tested). ±10% TTL jitter                                              | A popular key expiring must not trigger a thundering herd                                                                |
| 24     | Distributed caching                  | Redis is shared by every replica (course cache, rate-limit counters, leaderboard)                                                                                                                   | In-process caches would disagree across replicas                                                                         |
| 25     | Idempotency                          | Lessons: natural (primary key). Quiz attempts: `Idempotency-Key`, with the response stored in the **same transaction**; same key with a different body → 422; 24h TTL                               | Mobile networks drop responses; a retry must not double-award                                                            |
| 26–28  | Retries, exponential backoff, jitter | One `retry()` with full jitter, used for startup (DB, Redis), serialization and deadlock retries, and Redis reconnects                                                                              | Retries without jitter synchronize clients into waves                                                                    |
| 29     | Circuit breaker (equivalent)         | Redis runs in fail-fast mode: no offline queue, 1s command timeout, so callers fall straight back to Postgres; readiness reports `degraded`                                                         | That's what a breaker gives us here, with less code. Add a real breaker (opossum) for slow third-party HTTP APIs         |
| 30     | Rate limiting                        | A fixed window in Redis (one atomic Lua script): 300/min per IP across the API, 120/min per learner. `RateLimit-*` and `Retry-After` headers; fails open                                            | Shared across replicas; abuse protection without hurting users                                                           |
| 47     | Backpressure                         | Load shedding past `MAX_IN_FLIGHT` (cheap 503), a 100 KB body limit, a 15s request timeout, `statement_timeout`, `lock_timeout`                                                                     | Fail fast instead of queueing until memory runs out                                                                      |
| 48     | Graceful shutdown                    | SIGTERM: readiness 503, stop accepting, drain in-flight requests, close the pool and Redis, flush traces, then exit. A hard deadline backs it up. Tested on the real process                        | Deploys mustn't drop requests                                                                                            |
| 49     | Health checks                        | `/live` (process), `/ready` (Postgres required, Redis optional, fails while draining). Railway gates deploys on `/ready`                                                                            | Bad config never takes traffic                                                                                           |
| 50     | Distributed tracing                  | OpenTelemetry (http, pg, ioredis, pino) on W3C `traceparent`, so it continues Railway's edge trace; spans are named after routes; `trace_id` in every log line                                      | Answers "why was this request slow?", one service or many                                                                |
| 40–41  | Webhook verification, retries        | Svix signatures and timestamps are checked (forged, tampered and stale deliveries are rejected). Clerk retries with backoff. Handlers are idempotent and ignore out-of-order updates                | Webhooks are public endpoints and arrive late, twice, or out of order                                                    |
| 42     | Eventual consistency                 | The leaderboard is a Redis read model updated after commit; drift heals at the next rebuild (≤10 min, tested). Video progress converges via `GREATEST`                                              | Accept it where a slightly stale view is fine; never for XP itself                                                       |
| 37–38  | Background workers, job scheduling   | An hourly in-process job deletes expired idempotency keys; only one replica runs it, thanks to `pg_try_advisory_xact_lock`                                                                          | Small periodic work doesn't need a queue                                                                                 |
| 32–33  | Horizontal and vertical scaling      | Stateless instances; scale replicas on Railway. Vertical first: one instance handles about 1.8k req/s on the heaviest read                                                                          | Cheapest lever first                                                                                                     |
| 31, 34 | Load balancing, reverse proxy        | Railway's edge does both; `TRUST_PROXY` reads `X-Real-IP` / the last `X-Forwarded-For` entry, ignoring a spoofed one (tested)                                                                       | Nothing to run ourselves                                                                                                 |

**Not used yet: when they'd come in**

| #     | Concept                          | Trigger to adopt                                                                                                                                                                                                                             |
| ----- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17–18 | Read replicas, replication lag   | Postgres CPU is busy with reads after caching. Then route `GET /me/progress` to a replica and keep read-your-own-writes on the primary                                                                                                       |
| 19–20 | Sharding, partitioning           | `xp_events` reaches hundreds of millions of rows. Then partition it by month (that's when the leaderboard query gets old partitions pruned). Sharding is for millions of users, if ever                                                      |
| 35–36 | Message queue, dead-letter queue | Push reminders and emails. Then BullMQ on the same Redis, with retries and a DLQ of failed jobs                                                                                                                                              |
| 39    | Event-driven architecture        | A second service needs to react to "lesson completed". The `xp_events` ledger is already the event log to publish from                                                                                                                       |
| 43–44 | Distributed transactions, outbox | Writing to the DB and a queue must stay in step. Use the outbox, never 2PC: insert an `outbox` row in the same transaction and let a worker publish it. Today the only "after commit" side effect is the leaderboard cache, which self-heals |
| 45    | CQRS                             | Partly there already: the leaderboard is a separate read model. A full split only pays off for the admin dashboard's analytics                                                                                                               |
| 46    | Event sourcing                   | `xp_events` is an append-only ledger, and the totals could be rebuilt from it. Full event sourcing for all state would be over-engineering here                                                                                              |

## Ready for the web client and admin dashboard

- **Content in Postgres** with `draft → published → archived` status and `version` columns, so the dashboard edits in place with optimistic locking. Learners only ever see `published` content.
- **`users.role`** (`learner` | `admin`). Add a `requireRole('admin')` middleware next to `requireUser` and mount `/v1/admin/*`.
- **CORS** is configured from `CORS_ORIGINS`, and Clerk `azp` is checked against `CLERK_AUTHORIZED_PARTIES`, ready for browser clients.
- **The OpenAPI 3.1 spec** lets you generate typed clients for the web and admin apps (e.g. `openapi-typescript`).
- **Account deletion** cascades through Clerk's `user.deleted` webhook.
