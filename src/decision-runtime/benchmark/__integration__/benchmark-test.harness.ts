/**
 * Shared harness for E1 benchmark fault-injection integration tests.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { BenchmarkRunStore, newBenchmarkRunId } from '../benchmark-run.store';
import { BenchmarkInstanceExecutor } from '../benchmark-instance-executor';
import {
  buildRunConfig,
  hashDataset,
  stableRequestId,
} from '../benchmark-config.util';
import type {
  BenchmarkDataset,
  BenchmarkDatasetInstance,
  BenchmarkInstanceExecution,
  BenchmarkRunConfig,
} from '../benchmark-run.types';
import {
  hashJson,
  instanceArtifactDir,
  writeArtifact,
} from '../benchmark-artifact.util';
import { BenchmarkFakeHttpServer } from './benchmark-fake-http.server';

export const TEST_RUN_PREFIX = 'bench_test_';

export const INTEGRATION_INSTANCES: BenchmarkDatasetInstance[] = [
  {
    instanceId: 'FI-SAME-WINNER',
    partition: 'CALIBRATION',
    tripId: 'trip_fi_same',
    scenarioRef: 'TD-001-single-candidate',
    seed: 0,
    strategyVariant: 'default',
  },
  {
    instanceId: 'FI-DIFF-WINNER',
    partition: 'CALIBRATION',
    tripId: 'trip_fi_diff',
    scenarioRef: 'TD-006-three-way',
    seed: 0,
    strategyVariant: 'default',
  },
  {
    instanceId: 'FI-INPUT-MISMATCH',
    partition: 'CALIBRATION',
    tripId: 'trip_fi_mismatch',
    scenarioRef: 'TD-012-input-mismatch',
    seed: 0,
    strategyVariant: 'default',
  },
];

export async function ensureBenchmarkSchema(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM decision_benchmark_run LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function cleanupTestRuns(prisma: PrismaClient): Promise<void> {
  await prisma.decisionBenchmarkInstanceExecution.deleteMany({
    where: { benchmarkRunId: { startsWith: TEST_RUN_PREFIX } },
  });
  await prisma.decisionBenchmarkRun.deleteMany({
    where: { benchmarkRunId: { startsWith: TEST_RUN_PREFIX } },
  });
}

export interface BenchmarkTestHarness {
  prisma: PrismaClient;
  store: BenchmarkRunStore;
  fakeServer: BenchmarkFakeHttpServer;
  artifactRoot: string;
  dataset: BenchmarkDataset;
  baseConfig: BenchmarkRunConfig;
  createRun: (
    instances: BenchmarkDatasetInstance[],
    overrides?: Partial<BenchmarkRunConfig>,
  ) => Promise<{ benchmarkRunId: string; instances: BenchmarkInstanceExecution[] }>;
  executorFor: (
    runnerId: string,
    config?: BenchmarkRunConfig,
    deps?: ConstructorParameters<typeof BenchmarkInstanceExecutor>[3],
  ) => BenchmarkInstanceExecutor;
  instanceById: (runId: string, instanceId: string) => Promise<BenchmarkInstanceExecution>;
  dispose: () => Promise<void>;
}

export async function createBenchmarkTestHarness(input?: {
  leaseMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<BenchmarkTestHarness> {
  const prisma = new PrismaClient();
  const schemaReady = await ensureBenchmarkSchema(prisma);
  if (!schemaReady) {
    await prisma.$disconnect();
    throw new Error(
      'E1 benchmark tables missing — deploy migration 20260701170000_benchmark_batch_runner first',
    );
  }

  await cleanupTestRuns(prisma);

  const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bench-e1-artifacts-'));
  process.env.BENCHMARK_ARTIFACT_ROOT = artifactRoot;

  const fakeServer = new BenchmarkFakeHttpServer();
  const baseUrl = await fakeServer.start();

  const dataset: BenchmarkDataset = {
    datasetVersion: 'bench-fault-injection-v1',
    instances: INTEGRATION_INSTANCES,
  };

  const baseConfig = buildRunConfig({
    dataset,
    split: 'CALIBRATION',
    baseUrl,
    concurrency: 1,
    maxAttempts: 3,
    shadowWaitTimeoutMs: 5_000,
  });

  const store = new BenchmarkRunStore(prisma, { leaseMs: input?.leaseMs ?? 3_000 });

  const createRun = async (
    instances: BenchmarkDatasetInstance[],
    overrides?: Partial<BenchmarkRunConfig>,
  ) => {
    const benchmarkRunId = `${TEST_RUN_PREFIX}${newBenchmarkRunId().replace(/^bench_/, '')}`;
    const config = { ...baseConfig, ...overrides, datasetChecksum: hashDataset(dataset) };
    for (const inst of instances) {
      fakeServer.registerInstance(inst.instanceId, defaultBehavior(inst.instanceId));
    }
    const run = await store.createRun({ benchmarkRunId, config, instances });
    const rows = await store.listInstances(benchmarkRunId);
    return { benchmarkRunId, instances: rows, run };
  };

  const executorFor = (
    runnerId: string,
    config: BenchmarkRunConfig = baseConfig,
    deps?: ConstructorParameters<typeof BenchmarkInstanceExecutor>[3],
  ) =>
    new BenchmarkInstanceExecutor(store, config, runnerId, {
      sleepFn: input?.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      shadowPollIntervalMs: 20,
      ...deps,
    });

  const instanceById = async (runId: string, instanceId: string) => {
    const rows = await store.listInstances(runId);
    const row = rows.find((r) => r.instanceId === instanceId);
    if (!row) throw new Error(`Instance not found: ${instanceId}`);
    return row;
  };

  const dispose = async () => {
    await cleanupTestRuns(prisma);
    await fakeServer.stop();
    await prisma.$disconnect();
    await fs.rm(artifactRoot, { recursive: true, force: true });
    delete process.env.BENCHMARK_ARTIFACT_ROOT;
  };

  return {
    prisma,
    store,
    fakeServer,
    artifactRoot,
    dataset,
    baseConfig,
    createRun,
    executorFor,
    instanceById,
    dispose,
  };
}

function defaultBehavior(instanceId: string) {
  if (instanceId === 'FI-SAME-WINNER') {
    return {
      divergenceTypes: ['SAME_WINNER'],
      authorityWinner: 'cand-a',
      shadowWinner: 'cand-a',
      eligibleForStrategyComparison: true,
      materializeSkipReason: 'SAME_WINNER',
    };
  }
  if (instanceId === 'FI-INPUT-MISMATCH') {
    return {
      divergenceTypes: ['INPUT_MISMATCH'],
      eligibleForStrategyComparison: false,
      authorityWinner: 'cand-a',
      shadowWinner: 'cand-b',
    };
  }
  return {
    deferShadowPolls: 1,
    divergenceTypes: ['DIFFERENT_WINNER'],
    eligibleForStrategyComparison: true,
    authorityWinner: 'cand-a',
    shadowWinner: 'cand-b',
  };
}

export async function writeAuthorityArtifactOnly(input: {
  benchmarkRunId: string;
  instanceId: string;
  requestId: string;
  authorityWinner?: string;
}): Promise<{ artifactDir: string; hash: string }> {
  const artifactDir = instanceArtifactDir(input.benchmarkRunId, input.instanceId);
  const payload = {
    success: true,
    data: {
      record: { selectedCandidateId: input.authorityWinner ?? 'cand-a' },
    },
  };
  const { hash } = await writeArtifact(artifactDir, 'authority-response.json', payload);
  return { artifactDir, hash };
}

export async function seedAuthorityCheckpoint(
  store: BenchmarkRunStore,
  execution: BenchmarkInstanceExecution,
  input?: {
    authorityWinner?: string;
    fakeServer?: BenchmarkFakeHttpServer;
    tripId?: string;
    registerShadow?: boolean;
  },
): Promise<BenchmarkInstanceExecution> {
  let current = execution;
  if (current.status === 'PENDING') {
    current = await store.advanceInstance(current.id, {
      status: 'RUNNING',
      startedAt: new Date(),
    });
  }

  const { artifactDir, hash } = await writeAuthorityArtifactOnly({
    benchmarkRunId: current.benchmarkRunId,
    instanceId: current.instanceId,
    requestId: current.requestId,
    authorityWinner: input?.authorityWinner,
  });

  if (input?.fakeServer && input.registerShadow !== false) {
    input.fakeServer.registerShadowForDecisionRun({
      instanceId: current.instanceId,
      decisionRunId: current.requestId,
      tripId: input.tripId ?? current.instanceId,
    });
  }

  return store.advanceInstance(current.id, {
    status: 'AUTHORITY_COMPLETED',
    decisionRunId: current.requestId,
    authorityResponseHash: hash,
    artifactDirectory: artifactDir,
    authorityCompletedAt: new Date(),
  });
}

export async function seedShadowCheckpoint(
  store: BenchmarkRunStore,
  execution: BenchmarkInstanceExecution,
  input: {
    comparisonId: string;
    reviewCaseId?: string;
    shadowWinner?: string;
    eligibleForStrategyComparison?: boolean;
    divergenceTypes?: string[];
    fakeServer?: BenchmarkFakeHttpServer;
    tripId?: string;
  },
): Promise<BenchmarkInstanceExecution> {
  const authority = await seedAuthorityCheckpoint(store, execution, {
    fakeServer: input.fakeServer,
    tripId: input.tripId,
  });
  const artifactDir =
    authority.artifactDirectory ??
    instanceArtifactDir(execution.benchmarkRunId, execution.instanceId);
  const shadowEvent = {
    comparisonId: input.comparisonId,
    eligibleForStrategyComparison: input.eligibleForStrategyComparison ?? true,
    divergence: { types: input.divergenceTypes ?? ['DIFFERENT_WINNER'] },
    shadowResult: { selectedCandidateId: input.shadowWinner ?? 'cand-b' },
    authorityResult: { selectedCandidateId: 'cand-a' },
  };
  const { hash: shadowEventHash } = await writeArtifact(
    artifactDir,
    'shadow-event.json',
    shadowEvent,
  );
  return store.advanceInstance(authority.id, {
    status: 'SHADOW_COMPLETED',
    comparisonId: input.comparisonId,
    shadowEventHash,
    shadowWinnerId: input.shadowWinner ?? 'cand-b',
    eligibleForStrategyComparison: input.eligibleForStrategyComparison ?? true,
    divergenceTypes: input.divergenceTypes ?? ['DIFFERENT_WINNER'],
    shadowCompletedAt: new Date(),
    artifactDirectory: artifactDir,
    reviewCaseId: input.reviewCaseId,
  });
}

export async function forceTerminalStatus(
  prisma: PrismaClient,
  executionId: string,
  status: BenchmarkInstanceExecution['status'],
): Promise<void> {
  await prisma.decisionBenchmarkInstanceExecution.update({
    where: { id: executionId },
    data: {
      status,
      completedAt: ['COMPLETED', 'EXCLUDED', 'TERMINAL_FAILED'].includes(status)
        ? new Date()
        : undefined,
      lockedBy: null,
      leaseExpiresAt: null,
    },
  });
}

export function stableIdFor(
  benchmarkRunId: string,
  instanceId: string,
): string {
  return stableRequestId({
    benchmarkRunId,
    instanceId,
    seed: 0,
    strategyVariant: 'default',
  });
}

export async function reloadExecution(
  store: BenchmarkRunStore,
  id: string,
): Promise<BenchmarkInstanceExecution> {
  const row = await store.getInstance(id);
  if (!row) throw new Error(`Missing execution ${id}`);
  return row;
}

export { hashJson };
