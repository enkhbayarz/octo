import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { MediaObject, MediaStore } from '../../src/media/store.js';
import { courseCacheKey } from '../../src/modules/course/course.service.js';
import { startTestApp, type TestApp } from '../helpers/harness.js';

/** A bucket in memory, answering ranges and If-None-Match the way S3 does. */
function memoryStore(files: Record<string, string>): MediaStore & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async get(key, { range, ifNoneMatch } = {}): Promise<MediaObject | null> {
      reads.push(key);
      const content = files[key];
      if (content === undefined) return null;
      const etag = `"${key.length}-${content.length}"`;
      if (ifNoneMatch === etag) return { status: 304, etag };
      const bytes = new TextEncoder().encode(content);
      const match = range?.match(/^bytes=(\d+)-(\d+)$/);
      const [start, end] = match ? [Number(match[1]), Number(match[2])] : [0, bytes.length - 1];
      const slice = bytes.slice(start, end + 1);
      return {
        status: match ? 206 : 200,
        body: new Blob([slice]).stream(),
        contentLength: slice.length,
        contentRange: match ? `bytes ${start}-${end}/${bytes.length}` : undefined,
        etag,
        lastModified: 'Wed, 04 Nov 2026 00:00:00 GMT',
      };
    },
  };
}

const store = memoryStore({
  'videos/u1-l1/master.m3u8': '#EXTM3U\n720p/index.m3u8\n',
  'videos/u1-l1/720p/index.m3u8': '#EXTM3U\nseg_000.ts\n',
  'videos/u1-l1/720p/seg_000.ts': '0123456789',
  'videos/u1-l1/poster.jpg': 'jpeg',
});

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp({ PUBLIC_URL: 'https://api.octolearn.test' }, { media: store });
});
afterAll(() => app.close());

describe('GET /media/*', () => {
  test('serves HLS playlists as such, cached briefly so re-encodes show up', async () => {
    const response = await fetch(`${app.url}/media/videos/u1-l1/master.m3u8`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await response.text()).toContain('720p/index.m3u8');
  });

  test('serves segments and posters as immutable, for the CDN to keep', async () => {
    const segment = await fetch(`${app.url}/media/videos/u1-l1/720p/seg_000.ts`);
    expect(segment.headers.get('content-type')).toBe('video/mp2t');
    expect(segment.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(segment.headers.get('content-length')).toBe('10');
    expect(segment.headers.get('access-control-allow-origin')).toBe('*');
    expect(segment.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(await segment.text()).toBe('0123456789');

    const poster = await fetch(`${app.url}/media/videos/u1-l1/poster.jpg`);
    expect(poster.headers.get('content-type')).toBe('image/jpeg');
  });

  test('supports byte ranges and conditional requests', async () => {
    const partial = await fetch(`${app.url}/media/videos/u1-l1/720p/seg_000.ts`, {
      headers: { range: 'bytes=2-5' },
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await partial.text()).toBe('2345');

    const first = await fetch(`${app.url}/media/videos/u1-l1/poster.jpg`);
    const again = await fetch(`${app.url}/media/videos/u1-l1/poster.jpg`, {
      headers: { 'if-none-match': first.headers.get('etag')! },
    });
    expect(again.status).toBe(304);
  });

  test('missing files are a 404 envelope', async () => {
    const response = await fetch(`${app.url}/media/videos/u1-l9/master.m3u8`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as any).error.code).toBe('NOT_FOUND');
  });

  test('only lesson video files: no traversal, no other prefixes, no listing', async () => {
    const before = store.reads.length;
    for (const path of [
      'videos/u1-l1/../../secrets.txt',
      'videos/u1-l1/%2e%2e/x.ts',
      'backups/db.sql',
      'videos/',
      'videos/u1-l1/run.sh',
    ]) {
      expect((await fetch(`${app.url}/media/${path}`)).status).toBe(404);
    }
    expect(store.reads.length).toBe(before); // never reached the bucket
  });

  test('is off when no bucket is configured', async () => {
    const bare = await startTestApp();
    try {
      expect((await fetch(`${bare.url}/media/videos/u1-l1/master.m3u8`)).status).toBe(404);
    } finally {
      await bare.close();
    }
  });
});

describe('course video URLs', () => {
  test('media paths become absolute on the public URL; full URLs stay as they are', async () => {
    await app.deps.redis.del(courseCacheKey('english-a1'));
    await app.deps.db.execute(
      sql`update lessons set video_url = 'https://cdn.example.test/u1-l2.m3u8' where id = 'u1-l2'`,
    );
    try {
      const { body } = await app.call('/v1/courses/english-a1');
      const [first, second] = body.data.units[0].lessons;
      expect(first.videoUrl).toBe('https://api.octolearn.test/media/videos/u1-l1/master.m3u8');
      expect(second.videoUrl).toBe('https://cdn.example.test/u1-l2.m3u8');
    } finally {
      const { seedCourse } = await import('../../src/db/seed.js');
      await seedCourse(app.deps.db);
      await app.deps.redis.del(courseCacheKey('english-a1'));
    }
  });
});
