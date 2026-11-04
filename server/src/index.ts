import { type Config, ConfigError, loadConfig } from './config/env.js';
import { shutdownTelemetry } from './instrumentation.js';
import { createLogger } from './lib/logger.js';
import { createDeps, startServer } from './server.js';

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger({
  level: config.LOG_LEVEL,
  service: config.SERVICE_NAME,
  release: config.RELEASE,
  pretty: config.NODE_ENV === 'development',
});

const deps = await createDeps(config, logger);
const running = await startServer(deps);
logger.info(
  { url: running.url, release: config.RELEASE, env: config.NODE_ENV },
  'octolearn api listening',
);

async function stop(reason: string, exitCode: number) {
  // Hard deadline: Railway sends SIGKILL after its draining window anyway.
  setTimeout(() => {
    logger.error('shutdown deadline passed; exiting');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS).unref();
  await running.shutdown(reason);
  await shutdownTelemetry();
  process.exit(exitCode);
}

process.once('SIGTERM', () => void stop('SIGTERM', 0));
process.once('SIGINT', () => void stop('SIGINT', 0));
// After an unexpected error the process state is unknown: drain, exit non-zero, let Railway restart it.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  void stop('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  void stop('unhandledRejection', 1);
});
