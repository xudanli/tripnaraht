/**
 * 真实 Shadow 运行编排：冻结 Snapshot → 投影 → Shadow Record。
 * Graduation 架构冻结：复用既有 Contract / Deterministic Projection。
 */

import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import type { TravelWorldStateV1 } from '../../state-learning/travel-world-state.types';
import {
  createObservationTimeline,
  type ObservationTimelineV1,
} from '../pilot/observation-timeline.util';
import { projectTemporalImpactDeterministic } from '../temporal-graduation/deterministic-projection.util';
import { assertTemporalImpactAsEvidenceOnly } from '../temporal-graduation/temporal-impact.util';
import {
  freezePredictionTimeSnapshot,
  assertNoFutureEvidenceBackfillOrThrow,
} from './prediction-time-snapshot.util';
import {
  createTemporalShadowRecord,
  type TemporalShadowRecordV1,
} from './temporal-shadow-record.util';
import { statedConfidenceFromRuleId } from './confidence-calibration.util';
import type { SelectShadowValidationResult } from './select-shadow-scenario.util';

export type RunTemporalShadowResult =
  | {
      ok: true;
      record: TemporalShadowRecordV1;
    }
  | {
      ok: false;
      action: 'CONTINUE_PILOT';
      reasonZh: string;
    };

/**
 * 仅在 target.ok（QUALIFIED+APPROVED_FOR_SHADOW）时运行。
 */
export function runTemporalShadowProjection(input: {
  target: SelectShadowValidationResult;
  tripId: string;
  worldState: TravelWorldStateV1;
  evidence: EvidenceFactV1[];
  now?: string;
  observedTimeline?: ObservationTimelineV1;
}): RunTemporalShadowResult {
  if (input.target.ok === false) {
    return {
      ok: false,
      action: 'CONTINUE_PILOT',
      reasonZh: input.target.summaryZh.join('；'),
    };
  }

  const projectedAt = input.now ?? new Date().toISOString();
  const snapshot = freezePredictionTimeSnapshot({
    scenarioId: input.target.scenarioId,
    tripId: input.tripId,
    projectedAt,
    worldState: input.worldState,
    evidence: input.evidence,
  });

  /** 防未来 Evidence 混入重算路径 */
  assertNoFutureEvidenceBackfillOrThrow({
    snapshot,
    candidateEvidence: input.evidence,
  });

  const impact = projectTemporalImpactDeterministic({
    auth: input.target.auth,
    scenarioId: input.target.scenarioId,
    worldState: snapshot.worldState,
    evidence: snapshot.evidence,
    now: snapshot.projectedAt,
  });

  const binding = assertTemporalImpactAsEvidenceOnly(
    impact,
    'DECISION_RUNTIME_EVIDENCE',
  );
  if (binding.ok === false) {
    throw new Error(`[TemporalShadow] ${binding.code}:${binding.reason}`);
  }

  const timeline =
    input.observedTimeline ??
    createObservationTimeline({
      tripId: input.tripId,
      decisionKey: input.target.scenarioId,
    });

  const record = createTemporalShadowRecord({
    scenarioId: input.target.scenarioId,
    tripId: input.tripId,
    predictionTimeSnapshot: snapshot,
    impact,
    statedConfidence: statedConfidenceFromRuleId(impact.ruleId),
    observedTimeline: timeline,
  });

  return { ok: true, record };
}
