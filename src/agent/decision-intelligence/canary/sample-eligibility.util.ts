/**
 * DataQualityGate + SampleEligibility。
 * 低质量 WorldState、Evidence 不足、Outcome 不可观测 → 不得进入 Candidate 质量统计。
 */

import type { ComparableDecisionSnapshotV1 } from './comparable-snapshot.util';
import {
  assertEvidenceSufficiencyForConclusion,
  classifyEvidenceBucket,
} from '../../harness/hardening/evidence.contract';
import {
  checkTravelWorldStateConsistency,
} from '../../state-learning/hardening/world-state-quality.util';

export type SampleIneligibilityReason =
  | 'WORLDSTATE_LOW_QUALITY'
  | 'WORLDSTATE_INCONSISTENT'
  | 'EVIDENCE_INSUFFICIENT'
  | 'OUTCOME_UNOBSERVABLE'
  | 'NOT_CANARY_ADMITTED';

export type SampleEligibilityResult = {
  eligible: boolean;
  reasons: SampleIneligibilityReason[];
  detailZh: string[];
};

export type DataQualityGateInput = {
  snapshot: ComparableDecisionSnapshotV1;
  /** 是否已有可观测 Outcome（真实观测，非反事实） */
  outcomeObservable: boolean;
  /** Canary 是否已放行 */
  canaryAdmitted?: boolean;
  minWorldConfidence?: number;
  requireVerifiedEvidence?: boolean;
};

/**
 * 样本是否可进入 Candidate 质量统计。
 */
export function evaluateSampleEligibility(
  input: DataQualityGateInput,
): SampleEligibilityResult {
  const reasons: SampleIneligibilityReason[] = [];
  const detailZh: string[] = [];
  const minConf = input.minWorldConfidence ?? 0.45;
  const snap = input.snapshot;
  const q = snap.worldState.quality;

  if (q.overallConfidence < minConf) {
    reasons.push('WORLDSTATE_LOW_QUALITY');
    detailZh.push(`world confidence ${q.overallConfidence} < ${minConf}`);
  }
  /** 仅核心切片不可用才拒；空 Member/Booking 的 UNAVAILABLE 不单独否决 */
  if (
    q.slices.trip.freshness === 'UNAVAILABLE' &&
    q.slices.plan.freshness === 'UNAVAILABLE'
  ) {
    reasons.push('WORLDSTATE_LOW_QUALITY');
    detailZh.push('core trip/plan slices unavailable');
  }

  const consistency = checkTravelWorldStateConsistency(snap.worldState);
  if (!consistency.ok) {
    reasons.push('WORLDSTATE_INCONSISTENT');
    detailZh.push(
      consistency.issues
        .filter((i) => i.severity === 'ERROR')
        .map((i) => i.code)
        .join(','),
    );
  }

  const bag = classifyEvidenceBucket(snap.evidence);
  const sufficiency = assertEvidenceSufficiencyForConclusion({
    desiredStrength: input.requireVerifiedEvidence === false ? 'CONDITIONAL' : 'STRONG',
    evidence: snap.evidence,
  });
  if (
    snap.evidence.length === 0 ||
    (input.requireVerifiedEvidence !== false && bag.verified === 0) ||
    !sufficiency.ok
  ) {
    reasons.push('EVIDENCE_INSUFFICIENT');
    detailZh.push(
      `evidence verified=${bag.verified} assumed=${bag.assumed} len=${snap.evidence.length}`,
    );
  }

  if (!input.outcomeObservable) {
    reasons.push('OUTCOME_UNOBSERVABLE');
    detailZh.push('outcome not observable (excluded from candidate stats)');
  }

  if (input.canaryAdmitted === false) {
    reasons.push('NOT_CANARY_ADMITTED');
    detailZh.push('sample not in canary traffic');
  }

  const unique = [...new Set(reasons)];
  return {
    eligible: unique.length === 0,
    reasons: unique,
    detailZh,
  };
}
