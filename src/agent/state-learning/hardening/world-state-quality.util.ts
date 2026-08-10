/**
 * TravelWorldState Hardening — provenance / freshness / confidence + Consistency Check。
 */

import type { EvidenceFreshnessV1 } from '../../harness/hardening/evidence.contract';
import type { TravelWorldStateV1 } from '../travel-world-state.types';

export type SliceQualityV1 = {
  provenance: string[];
  freshness: EvidenceFreshnessV1;
  confidence: number;
};

export type TravelWorldStateQualityV1 = {
  overallFreshness: EvidenceFreshnessV1;
  overallConfidence: number;
  slices: {
    trip: SliceQualityV1;
    plan: SliceQualityV1;
    decisions: SliceQualityV1;
    execution: SliceQualityV1;
    risk: SliceQualityV1;
    members: SliceQualityV1;
    booking: SliceQualityV1;
  };
};

export type TravelWorldStateWithQualityV1 = TravelWorldStateV1 & {
  quality: TravelWorldStateQualityV1;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function worstFreshness(a: EvidenceFreshnessV1, b: EvidenceFreshnessV1): EvidenceFreshnessV1 {
  const rank: Record<EvidenceFreshnessV1, number> = {
    VERIFIED: 0,
    STALE: 1,
    ASSUMED: 2,
    UNAVAILABLE: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function sliceQuality(
  provenance: string[],
  freshness: EvidenceFreshnessV1,
  confidence: number,
): SliceQualityV1 {
  return {
    provenance,
    freshness,
    confidence: clamp01(confidence),
  };
}

/** 为已有投影附加 provenance / freshness / confidence（不改 SoT） */
export function attachTravelWorldStateQuality(
  state: TravelWorldStateV1,
): TravelWorldStateWithQualityV1 {
  const src = state.sources;
  const trip = sliceQuality(
    src.decisionOs || src.tripMetadata ? ['trip_meta_or_decision_os'] : [],
    src.decisionOs || src.tripMetadata ? 'VERIFIED' : 'UNAVAILABLE',
    src.decisionOs || src.tripMetadata ? 0.9 : 0.2,
  );
  const plan = sliceQuality(
    src.decisionOs || src.tripMetadata ? ['plan_version'] : [],
    state.plan.planVersion != null ? 'VERIFIED' : 'ASSUMED',
    state.plan.planVersion != null ? 0.85 : 0.35,
  );
  const decisions = sliceQuality(
    src.tripMetadata || state.decisions.open.length > 0 ? ['decision_store'] : [],
    state.decisions.open.length > 0 || state.decisions.latestCommitted
      ? 'VERIFIED'
      : 'ASSUMED',
    state.decisions.open.length > 0 || state.decisions.latestCommitted ? 0.8 : 0.4,
  );
  const execution = sliceQuality(
    src.liveConclusion ? ['live_conclusion'] : [],
    src.liveConclusion ? 'VERIFIED' : 'UNAVAILABLE',
    src.liveConclusion ? 0.75 : 0.15,
  );
  const risk = sliceQuality(
    src.riskEvents ? ['risk_events'] : [],
    src.riskEvents ? 'STALE' : 'UNAVAILABLE',
    src.riskEvents ? 0.7 : 0.2,
  );
  const members = sliceQuality(
    src.partyProfile ? ['party_profile'] : [],
    src.partyProfile ? 'ASSUMED' : 'UNAVAILABLE',
    src.partyProfile ? 0.65 : 0.2,
  );
  const booking = sliceQuality(
    src.lodgingFacts ? ['lodging_booking_facts'] : [],
    src.lodgingFacts ? 'VERIFIED' : 'ASSUMED',
    src.lodgingFacts ? 0.8 : 0.35,
  );

  const slices = { trip, plan, decisions, execution, risk, members, booking };
  let overallFreshness: EvidenceFreshnessV1 = 'VERIFIED';
  let confSum = 0;
  let confN = 0;
  for (const s of Object.values(slices)) {
    overallFreshness = worstFreshness(overallFreshness, s.freshness);
    confSum += s.confidence;
    confN += 1;
  }

  return {
    ...state,
    quality: {
      overallFreshness,
      overallConfidence: clamp01(confN ? confSum / confN : 0),
      slices,
    },
  };
}

export type StateConsistencyIssue = {
  code: string;
  severity: 'ERROR' | 'WARN';
  messageZh: string;
};

export type StateConsistencyCheckResult = {
  ok: boolean;
  issues: StateConsistencyIssue[];
};

/**
 * State Consistency Check：投影内部自洽，不写回、不改 Policy。
 */
export function checkTravelWorldStateConsistency(
  state: TravelWorldStateV1 | TravelWorldStateWithQualityV1,
): StateConsistencyCheckResult {
  const issues: StateConsistencyIssue[] = [];

  if (!state.trip.tripId?.trim()) {
    issues.push({
      code: 'MISSING_TRIP_ID',
      severity: 'ERROR',
      messageZh: '缺少 tripId',
    });
  }

  if (
    state.correlation.latestPlanVersion != null &&
    state.plan.planVersion != null &&
    state.correlation.latestPlanVersion !== state.plan.planVersion
  ) {
    issues.push({
      code: 'PLAN_VERSION_MISMATCH',
      severity: 'ERROR',
      messageZh: `plan.planVersion=${state.plan.planVersion} 与 correlation.latestPlanVersion=${state.correlation.latestPlanVersion} 不一致`,
    });
  }

  if (
    state.execution.appliedToItinerary === true &&
    !state.correlation.latestActionId
  ) {
    issues.push({
      code: 'APPLIED_WITHOUT_ACTION',
      severity: 'ERROR',
      messageZh: 'execution.appliedToItinerary=true 但缺少 latestActionId',
    });
  }

  if (
    state.execution.liveVerdict === 'YES' ||
    state.execution.liveVerdict === 'NO'
  ) {
    const q = 'quality' in state ? state.quality : null;
    if (q && q.slices.execution.freshness !== 'VERIFIED') {
      issues.push({
        code: 'STRONG_LIVE_WITHOUT_VERIFIED',
        severity: 'WARN',
        messageZh: '强硬 Live 结论但 execution 切片 freshness 非 VERIFIED',
      });
    }
  }

  if (
    state.booking.missingLodgingDays.some((d) => !Number.isFinite(d) || d < 0)
  ) {
    issues.push({
      code: 'INVALID_MISSING_LODGING_DAY',
      severity: 'ERROR',
      messageZh: 'missingLodgingDays 含非法日索引',
    });
  }

  if (
    state.correlation.latestDecisionId &&
    !state.decisions.open.some((d) => d.decisionId === state.correlation.latestDecisionId) &&
    state.decisions.latestCommitted?.decisionId !== state.correlation.latestDecisionId
  ) {
    issues.push({
      code: 'DECISION_REF_ORPHAN',
      severity: 'WARN',
      messageZh: 'correlation.latestDecisionId 未出现在 open/committed 投影中',
    });
  }

  return {
    ok: !issues.some((i) => i.severity === 'ERROR'),
    issues,
  };
}
