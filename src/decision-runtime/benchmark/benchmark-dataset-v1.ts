/**
 * Task E1 benchmark dataset v1 — 45 instances (15 calibration + 30 holdout scaffolding).
 *
 * Calibration: Task D scenarios + REAL-MULTI variants.
 * Holdout: reserved instance IDs for formal run (placeholder refs).
 */

import { buildTaskDScenarios } from '../../decision-lab/e2e/task-d-scenarios.fixture';
import type { BenchmarkDataset, BenchmarkDatasetInstance } from './benchmark-run.types';

export const BENCHMARK_DATASET_V1_VERSION = 'task-e1-45-v1';

const CALIBRATION_SCENARIO_IDS = [
  'TD-004-iceland-multi-lex',
  'TD-005-l2-drive-fork',
  'TD-006-three-way',
  'TD-007-l1-block',
  'TD-009-all-infeasible',
  'TD-012-input-mismatch',
  'TD-013-determinism',
  'TD-001-single-candidate',
  'TD-002-tied-utility',
  'TD-003-dominates',
  'TD-010-shadow-error',
  'TD-011-shadow-timeout',
  'TD-014-metadata-nomenclature',
  'REAL-MULTI-CANDIDATE-001',
  'REAL-MULTI-CANDIDATE-002',
];

const HOLDOUT_INSTANCE_IDS = Array.from({ length: 30 }, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  return `HOLDOUT-${n}`;
});

function scenarioInstance(
  scenarioRef: string,
  partition: 'CALIBRATION' | 'HOLDOUT',
  index: number,
): BenchmarkDatasetInstance {
  const realMulti = scenarioRef.startsWith('REAL-MULTI');
  return {
    instanceId: scenarioRef,
    partition,
    tripId: `bench_${partition.toLowerCase()}_${scenarioRef.replace(/[^a-zA-Z0-9]+/g, '_')}`,
    scenarioRef: realMulti ? 'REAL-MULTI-CANDIDATE' : scenarioRef,
    seed: 0,
    strategyVariant: 'default',
    realMulti: realMulti || undefined,
  };
}

export function buildBenchmarkDatasetV1(): BenchmarkDataset {
  const tdIds = buildTaskDScenarios().map((s) => s.id);
  const calibration: BenchmarkDatasetInstance[] = CALIBRATION_SCENARIO_IDS.map((ref, i) =>
    scenarioInstance(ref, 'CALIBRATION', i),
  ).filter((inst) => inst.realMulti || tdIds.includes(inst.scenarioRef));

  const holdout: BenchmarkDatasetInstance[] = HOLDOUT_INSTANCE_IDS.map((id, i) => ({
    instanceId: id,
    partition: 'HOLDOUT' as const,
    tripId: `bench_holdout_${String(i + 1).padStart(3, '0')}`,
    scenarioRef: tdIds[i % tdIds.length] ?? 'TD-006-three-way',
    seed: 0,
    strategyVariant: 'default',
  }));

  return {
    datasetVersion: BENCHMARK_DATASET_V1_VERSION,
    instances: [...calibration, ...holdout],
  };
}

export function filterDataset(
  dataset: BenchmarkDataset,
  input: {
    split?: 'CALIBRATION' | 'HOLDOUT' | 'ALL';
    only?: string[];
    maxInstances?: number;
    calibrationFirst?: boolean;
  },
): BenchmarkDatasetInstance[] {
  let items = [...dataset.instances];
  if (input.split && input.split !== 'ALL') {
    items = items.filter((i) => i.partition === input.split);
  }
  if (input.only?.length) {
    const set = new Set(input.only);
    items = items.filter((i) => set.has(i.instanceId));
  }
  if (input.calibrationFirst) {
    items.sort((a, b) => {
      if (a.partition === b.partition) return a.instanceId.localeCompare(b.instanceId);
      return a.partition === 'CALIBRATION' ? -1 : 1;
    });
  }
  if (input.maxInstances != null && input.maxInstances > 0) {
    items = items.slice(0, input.maxInstances);
  }
  return items;
}
