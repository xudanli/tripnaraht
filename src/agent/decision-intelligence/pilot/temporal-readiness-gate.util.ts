/**
 * Temporal Readiness Gate — 真实数据未满足条件前禁止进入 Temporal / Proactive。
 */

import type { TravelDecisionDatasetV1 } from '../evidence-accumulation/travel-decision-dataset.util';
import type { DecisionFunnelProgressV1 } from './decision-data-funnel.util';
import { classifyEvidenceQualitySlice } from './evaluation-slice.util';
import { isRealDecisionPilotKey } from './pilot-decision-keys.util';

export const TEMPORAL_READINESS_GATE_SCHEMA =
  'nara.temporal_readiness_gate@v1' as const;

export type TemporalReadinessCheckV1 = {
  schemaId: typeof TEMPORAL_READINESS_GATE_SCHEMA;
  version: 1;
  ready: boolean;
  missing: string[];
  detailZh: string[];
  /** 高质量 Episode 计数（Evaluation Valid + Pilot Key） */
  highQualityEpisodeCount: number;
  /** 禁止因测试通过而 ready */
  testsPassedDoNotImplyReady: true;
};

export function checkTemporalReadinessGate(input: {
  dataset: TravelDecisionDatasetV1;
  funnelProgresses?: DecisionFunnelProgressV1[];
  minHighQualityEpisodes?: number;
  minOutcomeObservableRate?: number;
  minAttributionValidRate?: number;
  minVerifiedEvidenceRate?: number;
  minDistinctTripPhases?: number;
}): TemporalReadinessCheckV1 {
  const minHQ = input.minHighQualityEpisodes ?? 20;
  const minOutcomeRate = input.minOutcomeObservableRate ?? 0.7;
  const minAttrRate = input.minAttributionValidRate ?? 0.6;
  const minVerifiedRate = input.minVerifiedEvidenceRate ?? 0.5;
  const minPhases = input.minDistinctTripPhases ?? 2;

  const missing: string[] = [];
  const detailZh: string[] = [];
  const records = input.dataset.records.filter((r) =>
    isRealDecisionPilotKey(r.decisionKey),
  );

  const progresses = input.funnelProgresses ?? [];
  const evalValid = progresses.filter(
    (p) =>
      p.stageReached === 'EVALUATION_VALID' ||
      p.stageReached === 'DISAGREEMENT',
  );
  const highQualityEpisodeCount =
    progresses.length > 0
      ? evalValid.length
      : records.filter((r) => r.outcome.observable && r.evaluation).length;

  if (highQualityEpisodeCount < minHQ) {
    missing.push('HIGH_QUALITY_EPISODES');
    detailZh.push(
      `highQualityEpisodes ${highQualityEpisodeCount} < ${minHQ}`,
    );
  }

  const outcomeRate =
    records.length === 0
      ? 0
      : records.filter((r) => r.outcome.observable).length / records.length;
  if (outcomeRate < minOutcomeRate) {
    missing.push('OUTCOME_OBSERVABILITY');
    detailZh.push(`outcomeObservableRate ${outcomeRate.toFixed(2)} < ${minOutcomeRate}`);
  }

  const attrRate =
    progresses.length === 0
      ? records.length
        ? records.filter((r) => r.outcome.observable).length / records.length
        : 0
      : progresses.filter((p) => p.flags.attributionValid).length /
        Math.max(1, progresses.length);
  if (attrRate < minAttrRate) {
    missing.push('ATTRIBUTION');
    detailZh.push(`attributionValidRate ${attrRate.toFixed(2)} < ${minAttrRate}`);
  }

  const verifiedRate =
    records.length === 0
      ? 0
      : records.filter(
          (r) => classifyEvidenceQualitySlice(r.evidence) === 'VERIFIED_RICH',
        ).length / records.length;
  if (verifiedRate < minVerifiedRate) {
    missing.push('WORLDSTATE_EVIDENCE_QUALITY');
    detailZh.push(`verifiedEvidenceRate ${verifiedRate.toFixed(2)} < ${minVerifiedRate}`);
  }

  const phases = new Set(
    records.map((r) => r.worldState.trip.lifecycle ?? 'UNKNOWN'),
  );
  if (phases.size < minPhases) {
    missing.push('TEMPORAL_COVERAGE');
    detailZh.push(`distinctTripPhases ${phases.size} < ${minPhases}`);
  }

  if (!input.dataset.readyForTemporalProactive && missing.length === 0) {
    missing.push('DATASET_FLAG');
    detailZh.push('dataset.readyForTemporalProactive=false');
  }

  detailZh.push('testsPassedDoNotImplyReady：单测通过不能打开 Temporal/Proactive');

  return {
    schemaId: TEMPORAL_READINESS_GATE_SCHEMA,
    version: 1,
    ready: missing.length === 0,
    missing,
    detailZh,
    highQualityEpisodeCount,
    testsPassedDoNotImplyReady: true,
  };
}
