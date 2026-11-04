/**
 * Uploads a folder of lesson media (from transcode-hls.sh) to the bucket.
 *
 *   railway run --service api -- bun run media:upload <dir>
 *
 * `railway run` supplies the bucket credentials from the api service. Keys
 * mirror the folder ("videos/u1-l1/720p/seg_004.ts"). Files already uploaded
 * with the same size are skipped, so an interrupted upload resumes.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { loadConfig } from '../src/config/env.js';
import { createS3Client } from '../src/media/store.js';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
};

const root = process.argv[2];
if (!root) {
  console.error('Usage: bun run media:upload <dir containing videos/>');
  process.exit(1);
}

// Only the bucket settings matter here; placeholders satisfy the rest of the schema.
const config = loadConfig({
  DATABASE_URL: 'postgres://unused@localhost/unused',
  REDIS_URL: 'redis://localhost',
  CLERK_JWT_KEY: 'unused',
  ...process.env,
});
const client = createS3Client(config);
const bucket = config.AWS_S3_BUCKET_NAME;
if (!client || !bucket) {
  console.error(
    'Bucket not configured: set AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME',
  );
  process.exit(1);
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) =>
      entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
    ),
  );
  return nested.flat().filter((path) => CONTENT_TYPES[extname(path)]);
}

async function alreadyUploaded(key: string, size: number) {
  try {
    const head = await client!.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength === size;
  } catch {
    return false;
  }
}

const paths = await files(root);
let uploaded = 0;
let skipped = 0;
let bytes = 0;
const queue = [...paths];

async function worker() {
  for (let path = queue.shift(); path; path = queue.shift()) {
    const key = relative(root!, path).split(sep).join('/');
    const { size } = await stat(path);
    if (await alreadyUploaded(key, size)) {
      skipped++;
      continue;
    }
    const playlist = key.endsWith('.m3u8');
    await client!.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(path),
        ContentType: CONTENT_TYPES[extname(path)],
        CacheControl: playlist ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
      }),
    );
    uploaded++;
    bytes += size;
    if (uploaded % 100 === 0) console.log(`${uploaded + skipped}/${paths.length} files…`);
  }
}

await Promise.all(Array.from({ length: 12 }, worker));
console.log(
  `done: ${uploaded} uploaded (${(bytes / 1024 / 1024).toFixed(0)} MB), ${skipped} already there, ${paths.length} total`,
);
