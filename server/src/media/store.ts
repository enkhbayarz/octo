import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { Config } from '../config/env.js';

/** A stored file, or the answer to a conditional/range request for it. */
export type MediaObject = {
  status: 200 | 206 | 304;
  body?: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  etag?: string;
  lastModified?: string;
};

/** Read access to lesson media. An interface, so tests use memory instead of a bucket. */
export type MediaStore = {
  /** Null when there is no such object. */
  get(key: string, options?: { range?: string; ifNoneMatch?: string }): Promise<MediaObject | null>;
};

export function createS3Client(config: Config): S3Client | null {
  const { AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME } = config;
  if (!AWS_ENDPOINT_URL || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET_NAME)
    return null;
  return new S3Client({
    endpoint: AWS_ENDPOINT_URL,
    region: config.AWS_DEFAULT_REGION,
    forcePathStyle: config.AWS_S3_URL_STYLE === 'path',
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
  });
}

function httpStatus(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

/**
 * Lesson media in a private S3-compatible bucket (a Railway Bucket). The API
 * streams objects through; a CDN in front caches them, so the bucket is only
 * read on a cache miss. Null when the bucket isn't configured.
 */
export function createS3MediaStore(config: Config): MediaStore | null {
  const client = createS3Client(config);
  const bucket = config.AWS_S3_BUCKET_NAME;
  if (!client || !bucket) return null;

  return {
    async get(key, { range, ifNoneMatch } = {}) {
      try {
        const object = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            Range: range,
            IfNoneMatch: ifNoneMatch,
          }),
        );
        return {
          status: object.ContentRange ? 206 : 200,
          body: object.Body?.transformToWebStream(),
          contentType: object.ContentType,
          contentLength: object.ContentLength,
          contentRange: object.ContentRange,
          etag: object.ETag,
          lastModified: object.LastModified?.toUTCString(),
        };
      } catch (error) {
        const status = httpStatus(error);
        if (status === 404 || (error as { name?: string }).name === 'NoSuchKey') return null;
        if (status === 304) return { status: 304, etag: ifNoneMatch };
        throw error;
      }
    },
  };
}
