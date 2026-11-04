import { Hono } from 'hono';

import type { AppEnv } from '../../http/context.js';
import { AppError } from '../../lib/errors.js';
import type { MediaStore } from '../../media/store.js';

/** Only lesson video files: no listing, no other prefixes, no "..". */
const KEY = /^videos\/[a-z0-9-]+\/(?:[\w-]+\/)?[\w-]+\.(m3u8|ts|m4s|mp4|jpg|webp)$/;

const CONTENT_TYPES: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  m4s: 'video/iso.segment',
  mp4: 'video/mp4',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * GET /media/videos/<lesson>/… streams HLS playlists, segments and posters from
 * the bucket. Segments never change once written, so they're cached for a year
 * ("immutable"); playlists for 5 minutes, so a re-encode shows up soon. With
 * Railway's CDN enabled on this service, viewers are served from the edge and
 * the API only sees cache misses. Public, like the course itself.
 */
export function mediaRoutes(store: MediaStore | null) {
  return new Hono<AppEnv>().get('/*', async (c) => {
    const key = decodeURIComponent(c.req.path.replace(/^\/media\//, ''));
    const match = KEY.exec(key);
    if (!store || !match) throw new AppError('NOT_FOUND', 'No such media');

    const object = await store.get(key, {
      range: c.req.header('range'),
      ifNoneMatch: c.req.header('if-none-match'),
    });
    if (!object) throw new AppError('NOT_FOUND', 'No such media');

    const extension = match[1]!;
    const headers = new Headers({
      'Content-Type': CONTENT_TYPES[extension] ?? object.contentType ?? 'application/octet-stream',
      'Cache-Control':
        extension === 'm3u8' ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
      // Any web player (hls.js) on any origin may load it.
      'Access-Control-Allow-Origin': '*',
    });
    if (object.etag) headers.set('ETag', object.etag);
    if (object.lastModified) headers.set('Last-Modified', object.lastModified);
    if (object.contentLength !== undefined)
      headers.set('Content-Length', String(object.contentLength));
    if (object.contentRange) headers.set('Content-Range', object.contentRange);

    return new Response(object.status === 304 ? null : object.body, {
      status: object.status,
      headers,
    });
  });
}
