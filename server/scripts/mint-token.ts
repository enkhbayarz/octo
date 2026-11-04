/**
 * Local development and load tests without a Clerk account: signs tokens
 * shaped like Clerk session tokens with a local RSA key.
 *
 *   bun run token -- --public-key      # PEM to put in CLERK_JWT_KEY
 *   bun run token -- user_local_1      # a 1-hour token for that user id
 *
 * Never use this key in a deployed environment: there, CLERK_JWT_KEY is
 * Clerk's public key and only Clerk can sign valid tokens.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { exportPKCS8, exportSPKI, generateKeyPair, importPKCS8, SignJWT } from 'jose';

const dir = new URL('../.keys/', import.meta.url);
const privatePath = new URL('dev-jwt.private.pem', dir);
const publicPath = new URL('dev-jwt.public.pem', dir);

if (!existsSync(privatePath)) {
  mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  writeFileSync(privatePath, await exportPKCS8(privateKey), { mode: 0o600 });
  writeFileSync(publicPath, await exportSPKI(publicKey));
}

const args = process.argv.slice(2);
if (args.includes('--public-key')) {
  process.stdout.write(readFileSync(publicPath, 'utf8'));
} else {
  const subject = args[0] ?? 'user_local_dev';
  const key = await importPKCS8(readFileSync(privatePath, 'utf8'), 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ sid: `sess_${subject}` })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'local-dev' })
    .setSubject(subject)
    .setIssuer('https://local.clerk.accounts.dev')
    .setIssuedAt(now - 5)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 60 * 60)
    .sign(key);
  process.stdout.write(`${token}\n`);
}
