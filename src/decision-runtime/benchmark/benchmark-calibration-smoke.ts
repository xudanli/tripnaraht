/**
 * Task E1.2 — Fixed 3-instance Calibration Staging smoke cohort.
 */

import type { BenchmarkDataset, BenchmarkDatasetInstance } from './benchmark-run.types';

export const CALIBRATION_SMOKE_DATASET_VERSION = 'task-e1-calibration-smoke-v1';

/** Ordered: SAME_WINNER → DIFF_WINNER (interrupt target) → REAL-MULTI */
export const CALIBRATION_SMOKE_INSTANCE_IDS = [
  'E1-CAL-01-SAME-WINNER',
  'E1-CAL-02-DIFF-WINNER',
  'E1-CAL-03-REAL-MULTI',
] as const;

export const CALIBRATION_SMOKE_INTERRUPT_TARGET = 'E1-CAL-02-DIFF-WINNER';

export function buildCalibrationSmokeInstances(): BenchmarkDatasetInstance[] {
  return [
    {
      instanceId: 'E1-CAL-01-SAME-WINNER',
      partition: 'CALIBRATION',
      tripId: 'bench_smoke_same_winner',
      scenarioRef: 'TD-002-tied-utility',
      seed: 0,
      strategyVariant: 'default',
    },
    {
      instanceId: 'E1-CAL-02-DIFF-WINNER',
      partition: 'CALIBRATION',
      tripId: 'bench_smoke_diff_winner',
      scenarioRef: 'TD-006-three-way',
      seed: 0,
      strategyVariant: 'default',
    },
    {
      instanceId: 'E1-CAL-03-REAL-MULTI',
      partition: 'CALIBRATION',
      tripId: 'bench_smoke_real_multi_iceland',
      scenarioRef: 'REAL-MULTI-CANDIDATE',
      seed: 42,
      strategyVariant: 'default',
      realMulti: true,
    },
  ];
}

export function buildCalibrationSmokeDataset(): BenchmarkDataset {
  return {
    datasetVersion: CALIBRATION_SMOKE_DATASET_VERSION,
    instances: buildCalibrationSmokeInstances(),
  };
}

export type CalibrationSmokeInterruptStage =
  | 'none'
  | 'after-authority-artifact'
  | 'after-shadow-artifact'
  | 'after-materialize';

export function parseInterruptStage(raw?: string): CalibrationSmokeInterruptStage {
  if (!raw || raw === 'none') return 'none';
  const norm = raw.toLowerCase().replace(/_/g, '-');
  if (norm === 'authority-artifact' || norm === 'after-authority-artifact') {
    return 'after-authority-artifact';
  }
  if (norm === 'shadow-artifact' || norm === 'after-shadow-artifact') {
    return 'after-shadow-artifact';
  }
  if (norm === 'materialize' || norm === 'after-materialize') {
    return 'after-materialize';
  }
  return 'none';
}
