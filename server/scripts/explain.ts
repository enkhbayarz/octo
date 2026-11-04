/**
 * EXPLAIN ANALYZE for the hot queries, on realistic volume.
 *
 *   DATABASE_URL=... bun run db:explain
 *
 * Tiny tables make Postgres (rightly) prefer sequential scans, which says
 * nothing about production. So this fills the tables with synthetic learners
 * and XP inside a transaction, plans the queries, then ROLLS BACK: the
 * database is left exactly as it was.
 */
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const LEARNERS = 20_000;
const EVENTS = 400_000;

const queries: [string, string][] = [
  [
    'Resolve a learner from their Clerk id (every request)',
    `select id, role, timezone from users where clerk_user_id = 'synthetic_4242'`,
  ],
  [
    'Weekly leaderboard rebuild (range + group by)',
    `select user_id, sum(amount)::int from xp_events
     where created_at >= date_trunc('week', now()) and created_at < date_trunc('week', now()) + interval '7 days'
     group by user_id`,
  ],
  [
    'Activity chart: one learner, last 7 days',
    `select day, sum(amount)::int from xp_events
     where user_id = (select id from users where clerk_user_id = 'synthetic_4242') and day >= current_date - 6
     group by day`,
  ],
  [
    'Quiz results for one learner',
    `select quiz_id, max(correct), bool_or(passed), count(*) from quiz_attempts
     where user_id = (select id from users where clerk_user_id = 'synthetic_4242') group by quiz_id`,
  ],
];

try {
  await client.query('begin');
  console.log(
    `Generating ${LEARNERS.toLocaleString()} learners and ${EVENTS.toLocaleString()} XP events (rolled back afterwards)…`,
  );
  await client.query(
    `insert into users (clerk_user_id) select 'synthetic_' || g from generate_series(1, $1) g`,
    [LEARNERS],
  );
  // 20 events per synthetic learner, spread over the last 60 days.
  await client.query(
    `insert into xp_events (user_id, source, source_id, amount, day, created_at)
     select u.id, 'lesson', 'u1-l1', 10, (t at time zone 'Asia/Ulaanbaatar')::date, t
     from users u
     cross join lateral (
       select now() - random() * interval '60 days' as t from generate_series(1, $1::int / $2::int)
     ) times
     where u.clerk_user_id like 'synthetic_%'`,
    [EVENTS, LEARNERS],
  );
  await client.query('analyze users; analyze xp_events; analyze quiz_attempts');

  for (const [title, sql] of queries) {
    const { rows } = await client.query<{ 'QUERY PLAN': string }>(
      `explain (analyze, buffers) ${sql}`,
    );
    console.log(`\n── ${title}\n${rows.map((row) => row['QUERY PLAN']).join('\n')}`);
  }
} finally {
  await client.query('rollback');
  await client.end();
}
