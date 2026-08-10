/**
 * Temporal Shadow Record — prediction-time State/Evidence → Impact → Timeline → Outcome → Evaluation。
 * 仅 Shadow；不向用户展示、不触发调整。
 */

import type { ObservationTimelineV1 } from '../pilot/observation-timeline.util';
import type { TemporalImpactV1 } from '../temporal-graduation/temporal-impact.util';
import type { TemporalEvaluationV1 } from '../temporal-graduation/temporal-evaluation.util';
import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { PredictionTimeSnapshotV1 } from './prediction-time-snapshot.util';
import type { OutcomeInterpretationV1 } from './outcome-interpretation.util';
import type { TemporalFailureAttributionV1 } from './temporal-failure-attribution.util';

export const TEMPORAL_SHADOW_RECORD_SCHEMA =
  'nara.temporal_shadow_record@v1' as const;

export type TemporalShadowRecordV1 = {
  schemaId: typeof TEMPORAL_SHADOW_RECORD_SCHEMA;
  version: 1;
  recordId: string;
  scenarioId: TemporalScenarioId;
  tripId: string;
  /** 预测时冻结快照 */
  predictionTimeSnapshot: PredictionTimeSnapshotV1;
  impact: TemporalImpactV1;
  /** 规则投影声明置信度（0–1），供校准 */
  statedConfidence: number;
  observedTimeline: ObservationTimelineV1;
  outcomeInterpretation?: OutcomeInterpretationV1;
  evaluation?: TemporalEvaluationV1;
  failureAttribution?: TemporalFailureAttributionV1;
  visibility: 'SHADOW';
  mayTriggerAdjustment: false;
  mayBypassHarness: false;
  proactiveClosed: true;
  futureEvidenceIsNotPastPredictionEvidence: true;
  /** Impact 仍只能作 Decision Runtime Evidence */
  impactRole: 'DECISION_RUNTIME_EVIDENCE_ONLY';
};

export function createTemporalShadowRecord(input: {
  scenarioId: TemporalScenarioId;
  tripId: string;
  predictionTimeSnapshot: PredictionTimeSnapshotV1;
  impact: TemporalImpactV1;
  statedConfidence: number;
  observedTimeline: ObservationTimelineV1;
  recordId?: string;
}): TemporalShadowRecordV1 {
  if (input.impact.visibility !== 'SHADOW') {
    throw new Error(
      '[TemporalShadowRecord] first_phase_shadow_only:visibility_must_be_SHADOW',
    );
  }
  if (
    input.predictionTimeSnapshot.projectedAt !== input.impact.projectedAt
  ) {
    throw new Error(
      '[TemporalShadowRecord] snapshot_projectedAt_must_match_impact',
    );
  }
  const conf = Math.max(0, Math.min(1, input.statedConfidence));
  return {
    schemaId: TEMPORAL_SHADOW_RECORD_SCHEMA,
    version: 1,
    recordId:
      input.recordId ?? `tsr_${input.impact.impactId}`,
    scenarioId: input.scenarioId,
    tripId: input.tripId,
    predictionTimeSnapshot: input.predictionTimeSnapshot,
    impact: input.impact,
    statedConfidence: conf,
    observedTimeline: input.observedTimeline,
    visibility: 'SHADOW',
    mayTriggerAdjustment: false,
    mayBypassHarness: false,
    proactiveClosed: true,
    futureEvidenceIsNotPastPredictionEvidence: true,
    impactRole: 'DECISION_RUNTIME_EVIDENCE_ONLY',
  };
}

export function attachShadowOutcomeAndEvaluation(
  record: TemporalShadowRecordV1,
  parts: {
    outcomeInterpretation: OutcomeInterpretationV1;
    evaluation: TemporalEvaluationV1;
    failureAttribution: TemporalFailureAttributionV1;
  },
): TemporalShadowRecordV1 {
  return {
    ...record,
    outcomeInterpretation: parts.outcomeInterpretation,
    evaluation: parts.evaluation,
    failureAttribution: parts.failureAttribution,
  };
}
