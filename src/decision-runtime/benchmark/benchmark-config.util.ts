/**
 * Frozen benchmark run config + drift detection on resume.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { OBJECTIVE_REGISTRY_VERSION } from '../objectives/objective-semantics.registry';
import type {
  BenchmarkRunConfig,
  BenchmarkDataset,
  BenchmarkDatasetInstance,
  ConfigDriftResult,
} from './benchmark-run.types';

export const BENCHMARK_VERSION = 'v1';
export const CONSTRAINT_POLICY_VERSION = 'constraint-policy@v1';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function hashInstanceInput(inst: BenchmarkDatasetInstance): string {
  return hashCanonical({
    instanceId: inst.instanceId,
    partition: inst.partition,
    scenarioRef: inst.scenarioRef,
    tripId: inst.tripId,
    seed: inst.seed ?? 0,
    strategyVariant: inst.strategyVariant ?? 'default',
    realMulti: inst.realMulti ?? false,
  });
}

export function hashDataset(dataset: BenchmarkDataset): string {
  return hashCanonical({
    datasetVersion: dataset.datasetVersion,
    instances: dataset.instances.map((i) => ({
      instanceId: i.instanceId,
      partition: i.partition,
      scenarioRef: i.scenarioRef,
      seed: i.seed ?? 0,
      strategyVariant: i.strategyVariant ?? 'default',
    })),
  });
}

export function resolveGitCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function resolveEnvironmentHash(): string {
  return hashCanonical({
    decisionRuntimeMode: process.env.DECISION_RUNTIME_MODE,
    solverEngine: process.env.CP_SAT_SOLVER_ENGINE,
    shadowPersistence: process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED,
    benchmarkVersion: BENCHMARK_VERSION,
  }).slice(0, 16);
}

export function buildRunConfig(input: {
  dataset: BenchmarkDataset;
  split: BenchmarkRunConfig['split'];
  baseUrl: string;
  concurrency: number;
  maxAttempts: number;
  shadowWaitTimeoutMs: number;
  noMaterialize?: boolean;
}): BenchmarkRunConfig {
  const datasetChecksum = hashDataset(input.dataset);
  return {
    benchmarkVersion: BENCHMARK_VERSION,
    datasetVersion: input.dataset.datasetVersion,
    datasetChecksum,
    split: input.split,
    authorityStrategyId: 'decision-core-finalize',
    shadowStrategyId: 'cp-sat-lexicographic',
    solverEngine: process.env.CP_SAT_SOLVER_ENGINE ?? 'cp-sat-lex-v1',
    objectiveRegistryVersion: OBJECTIVE_REGISTRY_VERSION,
    constraintPolicyVersion: CONSTRAINT_POLICY_VERSION,
    runtimeMode: process.env.DECISION_RUNTIME_MODE ?? 'SHADOW',
    gitCommit: resolveGitCommit(),
    environmentHash: resolveEnvironmentHash(),
    concurrency: input.concurrency,
    maxAttempts: input.maxAttempts,
    shadowWaitTimeoutMs: input.shadowWaitTimeoutMs,
    baseUrl: input.baseUrl.replace(/\/$/, ''),
    noMaterialize: input.noMaterialize,
  };
}

export function hashRunConfig(config: BenchmarkRunConfig): string {
  const { baseUrl: _b, noMaterialize: _n, ...frozen } = config;
  return hashCanonical(frozen);
}

export function stableRequestId(input: {
  benchmarkRunId: string;
  instanceId: string;
  seed: number;
  strategyVariant: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.benchmarkRunId}:${input.instanceId}:${input.strategyVariant}:${input.seed}`,
    )
    .digest('hex')
    .slice(0, 32);
}

export function detectConfigDrift(input: {
  frozen: BenchmarkRunConfig;
  frozenConfigHash: string;
  current: BenchmarkRunConfig;
  currentDatasetChecksum: string;
  allowFork?: boolean;
}): ConfigDriftResult {
  const details: string[] = [];
  const currentHash = hashRunConfig(input.current);

  if (currentHash !== input.frozenConfigHash) {
    if (input.frozen.gitCommit !== input.current.gitCommit) {
      details.push(`gitCommit ${input.frozen.gitCommit} → ${input.current.gitCommit}`);
    }
    if (input.frozen.objectiveRegistryVersion !== input.current.objectiveRegistryVersion) {
      details.push(
        `objectiveRegistryVersion ${input.frozen.objectiveRegistryVersion} → ${input.current.objectiveRegistryVersion}`,
      );
    }
    if (input.frozen.constraintPolicyVersion !== input.current.constraintPolicyVersion) {
      details.push(
        `constraintPolicyVersion ${input.frozen.constraintPolicyVersion} → ${input.current.constraintPolicyVersion}`,
      );
    }
    if (input.frozen.solverEngine !== input.current.solverEngine) {
      details.push(`solverEngine ${input.frozen.solverEngine} → ${input.current.solverEngine}`);
    }
    if (input.frozen.environmentHash !== input.current.environmentHash) {
      details.push(
        `environmentHash ${input.frozen.environmentHash} → ${input.current.environmentHash}`,
      );
    }
    if (details.length === 0) {
      details.push('configHash mismatch');
    }
  }

  if (input.currentDatasetChecksum !== input.frozen.datasetChecksum) {
    return {
      drifted: true,
      code: 'DATASET_DRIFT_DETECTED',
      details: [`datasetChecksum ${input.frozen.datasetChecksum} → ${input.currentDatasetChecksum}`],
    };
  }

  if (details.length > 0 && !input.allowFork) {
    return { drifted: true, code: 'CONFIG_DRIFT_DETECTED', details };
  }

  return { drifted: false, details: [] };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return value;
}
