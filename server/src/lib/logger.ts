import { type DestinationStream, pino, type Logger } from 'pino';

export type { Logger };

type LoggerOptions = {
  level: string;
  service: string;
  release: string;
  pretty?: boolean;
  /** Where to write; stdout by default. */
  destination?: DestinationStream;
};

/**
 * JSON logs, one line per event. Railway's log explorer reads `level` and
 * `message`, so both are emitted under those names and become filterable.
 */
export function createLogger({
  level,
  service,
  release,
  pretty = false,
  destination,
}: LoggerOptions): Logger {
  const options = {
    level,
    messageKey: 'message',
    base: { service, release },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: ['headers.authorization', 'headers.cookie', '*.token', '*.secret'],
      censor: '[redacted]',
    },
    transport: pretty
      ? { target: 'pino-pretty', options: { messageKey: 'message', translateTime: 'HH:MM:ss' } }
      : undefined,
  } satisfies pino.LoggerOptions;
  return destination ? pino(options, destination) : pino(options);
}
