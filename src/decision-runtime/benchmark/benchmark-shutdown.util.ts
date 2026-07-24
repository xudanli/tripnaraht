/**
 * Cooperative shutdown for benchmark batch runner (SIGINT during smoke hold).
 */

import * as fs from 'node:fs';

export class BenchmarkHoldAbortedError extends Error {
  constructor() {
    super('Benchmark smoke hold aborted by shutdown signal');
    this.name = 'BenchmarkHoldAbortedError';
  }
}

let abortRequested = false;

export function requestBenchmarkAbort(): void {
  abortRequested = true;
}

export function resetBenchmarkAbort(): void {
  abortRequested = false;
}

export function isBenchmarkAbortRequested(): boolean {
  if (abortRequested) return true;
  const abortFile = process.env.BENCHMARK_SMOKE_ABORT_FILE?.trim();
  if (abortFile) {
    try {
      if (fs.existsSync(abortFile)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export async function interruptibleSleep(
  ms: number,
  sleepFn: (delayMs: number) => Promise<void>,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (isBenchmarkAbortRequested()) {
      throw new BenchmarkHoldAbortedError();
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleepFn(Math.min(200, remaining));
  }
}
