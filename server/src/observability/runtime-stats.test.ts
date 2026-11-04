import { setTimeout as sleep } from 'node:timers/promises';

import { expect, test } from 'vitest';

import { createRuntimeStats } from './runtime-stats.js';

test('reports CPU and event-loop load for the last window', async () => {
  const stats = createRuntimeStats(100);
  try {
    // Block the event loop for 60ms inside the first 100ms window.
    const until = performance.now() + 60;
    while (performance.now() < until) Math.sqrt(Math.random());
    await sleep(120); // past the first window's end

    const snapshot = stats.snapshot();
    expect(snapshot.cpu.percent).toBeGreaterThan(10);
    expect(snapshot.eventLoop.utilization).toBeGreaterThan(0.3);
    expect(snapshot.eventLoop.delayMaxMs).toBeGreaterThan(20);
    expect(snapshot.memory.rssMb).toBeGreaterThan(10);
    expect(snapshot.loadAverage).toHaveLength(3);
  } finally {
    stats.stop();
  }
});
