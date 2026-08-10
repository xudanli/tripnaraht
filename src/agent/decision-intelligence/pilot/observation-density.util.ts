/**
 * Observation Density / Temporal Coverage — 仅基于已有观测时序，禁止 Prediction。
 */

import type { ObservationTimelineV1 } from './observation-timeline.util';
import type { TravelDecisionDatasetV1 } from '../evidence-accumulation/travel-decision-dataset.util';

export type ObservationDensityMetricsV1 = {
  tripId?: string;
  entryCount: number;
  worldStateCount: number;
  evidenceCount: number;
  eventCount: number;
  /** 相邻观测间隔（小时）中位数；无足够点则为 null */
  medianGapHours: number | null;
  /** 观测跨度（小时） */
  spanHours: number | null;
  noPrediction: true;
};

export type TemporalCoverageMetricsV1 = {
  distinctTripPhases: string[];
  distinctDecisionKeys: string[];
  recordsWithOutcome: number;
  recordsTotal: number;
  phaseCoverageRate: number;
  /** 分布供后续冻结阈值，本阶段不武断判定达标 */
  distributionOnly: true;
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeObservationDensity(
  timeline: ObservationTimelineV1,
): ObservationDensityMetricsV1 {
  const entries = timeline.entries;
  const times = entries
    .map((e) => Date.parse(e.at))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push((times[i] - times[i - 1]) / 3_600_000);
  }
  return {
    tripId: timeline.tripId,
    entryCount: entries.length,
    worldStateCount: entries.filter((e) => e.kind === 'WORLD_STATE').length,
    evidenceCount: entries.filter((e) => e.kind === 'EVIDENCE').length,
    eventCount: entries.filter((e) => e.kind === 'EVENT').length,
    medianGapHours: median(gaps),
    spanHours:
      times.length >= 2
        ? (times[times.length - 1] - times[0]) / 3_600_000
        : times.length === 1
          ? 0
          : null,
    noPrediction: true,
  };
}

export function computeTemporalCoverage(
  dataset: TravelDecisionDatasetV1,
): TemporalCoverageMetricsV1 {
  const phases = new Set(
    dataset.records.map((r) => r.worldState.trip.lifecycle ?? 'UNKNOWN'),
  );
  const keys = new Set(dataset.records.map((r) => r.decisionKey));
  const withOutcome = dataset.records.filter((r) => r.outcome.observable).length;
  return {
    distinctTripPhases: [...phases].sort(),
    distinctDecisionKeys: [...keys].sort(),
    recordsWithOutcome: withOutcome,
    recordsTotal: dataset.records.length,
    phaseCoverageRate: phases.size / 4,
    distributionOnly: true,
  };
}
