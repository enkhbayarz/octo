/**
 * OpenTelemetry tracing. Loaded before the app with `node --import`, so the
 * HTTP server, `pg` and `ioredis` are patched before anything imports them.
 *
 * Off unless an OTLP endpoint is configured. On Railway, turning on Tracing
 * for the service injects OTEL_EXPORTER_OTLP_* and OTEL_SERVICE_NAME on the
 * next deploy, and spans show up in the project's Traces tab next to
 * Railway's own edge spans (W3C traceparent continues the edge's trace).
 */
import { register } from 'node:module';

import type { NodeSDK } from '@opentelemetry/sdk-node';

const endpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
const enabled = Boolean(endpoint) && process.env.OTEL_SDK_DISABLED !== 'true';

let sdk: NodeSDK | undefined;

if (enabled) {
  // Railway's receiver takes traces only.
  process.env.OTEL_METRICS_EXPORTER ??= 'none';
  process.env.OTEL_LOGS_EXPORTER ??= 'none';

  // ES modules are patched through a loader hook, registered before they load.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

  const [
    { NodeSDK },
    { HttpInstrumentation },
    { PgInstrumentation },
    { IORedisInstrumentation },
    { PinoInstrumentation },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-pg'),
    import('@opentelemetry/instrumentation-ioredis'),
    import('@opentelemetry/instrumentation-pino'),
  ]);

  sdk = new NodeSDK({
    instrumentations: [
      new HttpInstrumentation({
        // Health checks and metric scrapes would drown the real traffic.
        ignoreIncomingRequestHook: (request) => /^\/(health|metrics)/.test(request.url ?? ''),
      }),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
      // Adds trace_id/span_id to every log line, so logs and traces link up.
      new PinoInstrumentation(),
    ],
  });
  sdk.start();
}

/** Flushes buffered spans; called during graceful shutdown. */
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown().catch(() => {});
}
