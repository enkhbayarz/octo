/**
 * A real Clerk session token for testing the deployed API before the app is
 * wired up. Finds (or creates) a test user by email in your Clerk DEVELOPMENT
 * instance, opens a session for them and prints a token valid for an hour.
 *
 *   CLERK_SECRET_KEY=sk_test_... bun run --silent clerk-token -- tester@example.com
 *
 * Development instances only: never point this at a production instance.
 */
import { createClerkClient } from '@clerk/backend';

const secretKey = process.env.CLERK_SECRET_KEY;
const email = process.argv[2] ?? 'octolearn-tester@example.com';
if (!secretKey?.startsWith('sk_test_')) {
  console.error('Set CLERK_SECRET_KEY to a development key (sk_test_…).');
  process.exit(1);
}

const clerk = createClerkClient({ secretKey });
const { data: existing } = await clerk.users.getUserList({ emailAddress: [email] });
// Instances differ in what sign-up requires; send a username only when Clerk asks for one.
async function createTestUser() {
  const base = { emailAddress: [email], firstName: 'Tester', skipPasswordRequirement: true };
  try {
    return await clerk.users.createUser(base);
  } catch (error) {
    const needsUsername = (error as { errors?: { longMessage?: string }[] }).errors?.some((e) =>
      e.longMessage?.includes('username'),
    );
    if (!needsUsername) throw error;
    // Letters, digits, "-" and "_", 4–64 chars.
    const username = email
      .split('@')[0]!
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .padEnd(4, '_')
      .slice(0, 64);
    return clerk.users.createUser({ ...base, username });
  }
}

const user = existing[0] ?? (await createTestUser());
const session = await clerk.sessions.createSession({ userId: user.id });
const { jwt } = await clerk.sessions.getToken(session.id, undefined, 60 * 60);
process.stdout.write(`${jwt}\n`);
