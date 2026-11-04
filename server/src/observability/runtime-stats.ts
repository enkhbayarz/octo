import os from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const MB = 1024 * 1024;
const round = (value: number, digits = 1) => Number(value.toFixed(digits));

export type RuntimeStats = ReturnType<typeof createRuntimeStats>;

/**
 * A human-readable snapshot of how loaded this process is: CPU %, memory,
 * event-loop delay and utilization, each measured over the last window
 * (5s), so it shows the load now rather than an average since boot.
 */
export function createRuntimeStats(sampleMs = 5_000) {
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();

  let lastCpu = process.cpuUsage();
  let lastTime = performance.now();
  let lastElu = performance.eventLoopUtilization();
  let cpuPercent = 0;
  let loopUtilization = 0;
  let delay = { p50: 0, p99: 0, max: 0 };

  const timer = setInterval(() => {
    const now = performance.now();
    const cpu = process.cpuUsage(lastCpu);
    cpuPercent = ((cpu.user + cpu.system) / 1000 / (now - lastTime)) * 100;
    loopUtilization = performance.eventLoopUtilization(lastElu).utilization;
    lastCpu = process.cpuUsage();
    lastElu = performance.eventLoopUtilization();
    lastTime = now;
    delay = { p50: loopDelay.percentile(50), p99: loopDelay.percentile(99), max: loopDelay.max };
    loopDelay.reset();
  }, sampleMs);
  timer.unref();

  return {
    snapshot() {
      const memory = process.memoryUsage();
      return {
        uptimeSec: Math.round(process.uptime()),
        node: process.version,
        pid: process.pid,
        cpu: { percent: round(cpuPercent), cores: os.availableParallelism() },
        memory: {
          rssMb: round(memory.rss / MB),
          heapUsedMb: round(memory.heapUsed / MB),
          heapTotalMb: round(memory.heapTotal / MB),
          externalMb: round(memory.external / MB),
        },
        eventLoop: {
          delayP50Ms: round(delay.p50 / 1e6, 2),
          delayP99Ms: round(delay.p99 / 1e6, 2),
          delayMaxMs: round(delay.max / 1e6, 2),
          utilization: round(loopUtilization, 3),
        },
        loadAverage: os.loadavg().map((value) => round(value, 2)),
      };
    },
    stop() {
      clearInterval(timer);
      loopDelay.disable();
    },
  };
}
