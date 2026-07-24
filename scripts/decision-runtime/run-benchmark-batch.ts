/**
 * Task E1 — Formal benchmark batch runner (staged checkpoint/resume).
 *
 * Usage:
 *   npm run task-e1:benchmark-batch -- --split calibration --concurrency 1 --max-instances 3
 *   npm run task-e1:benchmark-batch -- --resume <benchmarkRunId>
 *   npm run task-e1:benchmark-batch -- --status <benchmarkRunId>
 *   npm run task-e1:benchmark-batch:dry-run
 *
 * Requires SHADOW_EVIDENCE_PERSISTENCE_ENABLED=1 and E1 migration deployed.
 */

import * as os from 'node:os';
import { PrismaClient } from '@prisma/client';
import {
  buildBenchmarkDatasetV1,
  filterDataset,
} from '../../src/decision-runtime/benchmark/benchmark-dataset-v1';
import {
  buildCalibrationSmokeDataset,
  buildCalibrationSmokeInstances,
} from '../../src/decision-runtime/benchmark/benchmark-calibration-smoke';
import {
  buildRunConfig,
  detectConfigDrift,
  hashRunConfig,
} from '../../src/decision-runtime/benchmark/benchmark-config.util';
import {
  BenchmarkRunStore,
  newBenchmarkRunId,
} from '../../src/decision-runtime/benchmark/benchmark-run.store';
import { BenchmarkInstanceExecutor } from '../../src/decision-runtime/benchmark/benchmark-instance-executor';
import {
  BenchmarkHoldAbortedError,
  requestBenchmarkAbort,
  resetBenchmarkAbort,
} from '../../src/decision-runtime/benchmark/benchmark-shutdown.util';
import {
  writeProgressReport,
  writeRunManifest,
} from '../../src/decision-runtime/benchmark/benchmark-progress.util';
import type { BenchmarkDatasetSplit } from '../../src/decision-runtime/benchmark/benchmark-run.types';

const DEFAULT_BASE = 'http://localhost:3001/api';

interface CliOptions {
  dryRun: boolean;
  statusOnly: boolean;
  resumeId?: string;
  statusRunId?: string;
  forkFrom?: string;
  split: BenchmarkDatasetSplit;
  only?: string[];
  maxInstances?: number;
  calibrationFirst: boolean;
  noMaterialize: boolean;
  concurrency: number;
  maxAttempts: number;
  shadowWaitTimeoutMs: number;
  runnerId: string;
  baseUrl: string;
  smokeCalibration: boolean;
  benchmarkRunId?: string;
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] ${line}`);
}

function parseArgs(argv: string[]): CliOptions {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);

  const splitRaw = (get('--split') ?? 'ALL').toUpperCase();
  const split =
    splitRaw === 'CALIBRATION' || splitRaw === 'HOLDOUT' || splitRaw === 'ALL'
      ? splitRaw
      : 'ALL';

  const onlyRaw = get('--only');
  const maxRaw = get('--max-instances');

  const statusIdx = argv.indexOf('--status');
  const resumeIdx = argv.indexOf('--resume');

  return {
    dryRun: has('--dry-run'),
    statusOnly: statusIdx >= 0,
    resumeId: resumeIdx >= 0 ? argv[resumeIdx + 1] : undefined,
    statusRunId: statusIdx >= 0 ? argv[statusIdx + 1] : undefined,
    forkFrom: get('--fork-from'),
    split,
    only: onlyRaw ? onlyRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    maxInstances: maxRaw ? Number(maxRaw) : undefined,
    calibrationFirst: has('--calibration-first'),
    noMaterialize: has('--no-materialize'),
    concurrency: Number(get('--concurrency') ?? '1'),
    maxAttempts: Number(get('--max-attempts') ?? '3'),
    shadowWaitTimeoutMs: Number(get('--shadow-wait-timeout-ms') ?? '120000'),
    runnerId: get('--runner-id') ?? `runner_${os.hostname()}_${process.pid}`,
    baseUrl: (argv.find((a) => a.startsWith('http')) ?? DEFAULT_BASE).replace(/\/$/, ''),
    smokeCalibration: has('--smoke-calibration'),
    benchmarkRunId: get('--benchmark-run-id'),
  };
}

async function printStatus(store: BenchmarkRunStore, benchmarkRunId: string): Promise<void> {
  const run = await store.getRun(benchmarkRunId);
  if (!run) {
    throw new Error(`Benchmark run not found: ${benchmarkRunId}`);
  }
  const instances = await store.listInstances(benchmarkRunId);
  const progressPath = await writeProgressReport({ run, instances });
  log(`Run ${benchmarkRunId} status=${run.status}`);
  log(
    `Instances: total=${run.totalInstances} completed=${run.completedInstances} failed=${run.failedInstances} excluded=${run.excludedInstances}`,
  );
  log(`Progress report → ${progressPath}`);
  for (const inst of instances) {
    log(
      `  ${inst.instanceId} status=${inst.status} attempts=${inst.attemptCount} stage=${inst.lastErrorStage ?? '-'} comparison=${inst.comparisonId ?? '-'}`,
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.dryRun && process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED !== '1') {
    throw new Error('SHADOW_EVIDENCE_PERSISTENCE_ENABLED=1 required for benchmark batch runner');
  }

  const dataset = opts.smokeCalibration
    ? buildCalibrationSmokeDataset()
    : buildBenchmarkDatasetV1();
  const filteredInstances = opts.smokeCalibration
    ? buildCalibrationSmokeInstances()
    : filterDataset(dataset, {
        split: opts.split,
        only: opts.only,
        maxInstances: opts.maxInstances,
        calibrationFirst: opts.calibrationFirst,
      });

  const currentConfig = buildRunConfig({
    dataset,
    split: opts.smokeCalibration ? 'CALIBRATION' : opts.split,
    baseUrl: opts.baseUrl,
    concurrency: opts.concurrency,
    maxAttempts: opts.maxAttempts,
    shadowWaitTimeoutMs: opts.shadowWaitTimeoutMs,
    noMaterialize: opts.noMaterialize,
  });

  if (opts.dryRun) {
    log('Task E1 dry-run — no HTTP or DB writes');
    log(`Dataset checksum: ${currentConfig.datasetChecksum}`);
    log(`Config hash: ${hashRunConfig(currentConfig)}`);
    log(`Instances (${filteredInstances.length}): ${filteredInstances.map((i) => i.instanceId).join(', ')}`);
    return;
  }

  const prisma = new PrismaClient();
  const store = new BenchmarkRunStore(prisma);

  let benchmarkRunId = opts.resumeId ?? opts.statusRunId;
  let run = benchmarkRunId ? await store.getRun(benchmarkRunId) : undefined;

  if (opts.statusOnly) {
    if (!benchmarkRunId) throw new Error('--status requires benchmarkRunId');
    await printStatus(store, benchmarkRunId);
    await prisma.$disconnect();
    return;
  }

  if (opts.resumeId) {
    if (!run) throw new Error(`Cannot resume — run not found: ${opts.resumeId}`);
    const drift = detectConfigDrift({
      frozen: run.config,
      frozenConfigHash: run.configHash,
      current: currentConfig,
      currentDatasetChecksum: currentConfig.datasetChecksum,
      allowFork: Boolean(opts.forkFrom),
    });
    if (drift.drifted) {
      throw new Error(`${drift.code}: ${drift.details.join('; ')}`);
    }
    if (run.status === 'PAUSED' || run.status === 'CREATED') {
      await store.updateRunStatus(benchmarkRunId, 'RUNNING');
    }
    log(`Resuming run ${benchmarkRunId} (${run.totalInstances} instances)`);
  } else {
    benchmarkRunId = opts.benchmarkRunId ?? newBenchmarkRunId();
    run = await store.createRun({
      benchmarkRunId,
      config: currentConfig,
      instances: filteredInstances,
      forkedFromRunId: opts.forkFrom,
    });
    await store.updateRunStatus(benchmarkRunId, 'RUNNING');
    const instances = await store.listInstances(benchmarkRunId);
    const manifestPath = await writeRunManifest(run, instances);
    log(`Created run ${benchmarkRunId} with ${filteredInstances.length} instances`);
    log(`Manifest → ${manifestPath}`);
    console.log(`BENCHMARK_RUN_ID=${benchmarkRunId}`);
  }

  const instanceById = new Map(
    (opts.smokeCalibration ? buildCalibrationSmokeInstances() : filterDataset(dataset, { split: 'ALL' })).map(
      (i) => [i.instanceId, i],
    ),
  );

  resetBenchmarkAbort();
  let shuttingDown = false;
  let activeExecutionId: string | undefined;

  const onSignal = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    requestBenchmarkAbort();
    log(`${signal} received — cooperative pause (abort hold if active)`);
    if (benchmarkRunId) {
      await store.updateRunStatus(benchmarkRunId, 'PAUSED');
    }
  };
  process.on('SIGINT', () => void onSignal('SIGINT'));
  process.on('SIGTERM', () => void onSignal('SIGTERM'));

  const executor = new BenchmarkInstanceExecutor(store, currentConfig, opts.runnerId);
  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, () =>
    workerLoop(),
  );

  async function workerLoop(): Promise<void> {
    while (!shuttingDown) {
      if (!benchmarkRunId) break;
      const claimable = await store.countClaimable(benchmarkRunId);
      if (claimable === 0) break;

      const claimed = await store.claimNextInstance({
        benchmarkRunId,
        runnerId: opts.runnerId,
        onlyInstanceIds: opts.only,
      });
      if (!claimed) {
        await sleep(500);
        continue;
      }

      activeExecutionId = claimed.id;
      const datasetInst = instanceById.get(claimed.instanceId);
      if (!datasetInst) {
        await store.advanceInstance(claimed.id, {
          status: 'TERMINAL_FAILED',
          lastErrorMessage: `Unknown instance ${claimed.instanceId}`,
          lastErrorStage: 'LOAD',
          completedAt: new Date(),
        });
        activeExecutionId = undefined;
        continue;
      }

      log(`Executing ${claimed.instanceId} status=${claimed.status} attempt=${claimed.attemptCount}`);
      try {
        const result = await executor.execute(claimed, datasetInst);
        await store.releaseLease(claimed.id, opts.runnerId);
        activeExecutionId = undefined;

        if (result.abortRun) {
          shuttingDown = true;
          await store.updateRunStatus(benchmarkRunId, 'FAILED');
          throw new Error(`Run aborted after ${claimed.instanceId} (${result.status})`);
        }
      } catch (err) {
        await store.releaseLease(claimed.id, opts.runnerId);
        activeExecutionId = undefined;
        if (err instanceof BenchmarkHoldAbortedError) {
          shuttingDown = true;
          if (benchmarkRunId) {
            await store.updateRunStatus(benchmarkRunId, 'PAUSED');
          }
          log(`Hold aborted during ${claimed.instanceId} — exiting worker`);
          break;
        }
        throw err;
      }
    }
  }

  await Promise.all(workers);

  if (shuttingDown && activeExecutionId) {
    await store.releaseLease(activeExecutionId, opts.runnerId);
    activeExecutionId = undefined;
  }

  if (benchmarkRunId && !shuttingDown) {
    await store.aggregateRunCounters(benchmarkRunId);
    const finalRun = await store.getRun(benchmarkRunId);
    const instances = await store.listInstances(benchmarkRunId);
    if (finalRun) {
      await writeProgressReport({ run: finalRun, instances });
      log(
        `Run finished status=${finalRun.status} completed=${finalRun.completedInstances}/${finalRun.totalInstances}`,
      );
    }
  }

  await prisma.$disconnect();
  if (shuttingDown) {
    process.exit(0);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
