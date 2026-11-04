import { Writable } from 'node:stream';

import { expect, test } from 'vitest';

import { createLogger } from './logger.js';

function captured() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  return { lines, destination };
}

test('one JSON line per event with `level` and `message`, the fields Railway indexes', () => {
  const { lines, destination } = captured();
  const logger = createLogger({
    level: 'info',
    service: 'octolearn-api',
    release: 'abc1234',
    destination,
  });
  logger.child({ requestId: 'r-1' }).warn({ route: '/v1/me' }, 'slow request');
  logger.debug('below the level: dropped');

  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({
    level: 'warn',
    message: 'slow request',
    service: 'octolearn-api',
    release: 'abc1234',
    requestId: 'r-1',
    route: '/v1/me',
    time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
  });
});

test('redacts credentials that end up in log fields', () => {
  const { lines, destination } = captured();
  const logger = createLogger({ level: 'info', service: 's', release: 'r', destination });
  logger.info(
    { headers: { authorization: 'Bearer secret', cookie: 'sid=1' }, webhook: { secret: 'whsec' } },
    'x',
  );
  expect(lines[0]).toMatchObject({
    headers: { authorization: '[redacted]', cookie: '[redacted]' },
    webhook: { secret: '[redacted]' },
  });
});

test('pretty, human-readable output in development', () => {
  const logger = createLogger({ level: 'debug', service: 's', release: 'r', pretty: true });
  expect(logger.level).toBe('debug');
});
