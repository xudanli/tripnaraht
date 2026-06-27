/**
 * POI Access 评估 → Readiness P0 契约类型
 */

import type {
  AccessCapacityEvaluationResult,
  AccessCapacityPlanB,
  PoiCrowdLevel,
  PoiAccessTargetResource,
} from '../interfaces/poi-access-capacity.interface';

export type FeasibilityPoiAccessIssueKind =
  | 'poi_access_blocked'
  | 'poi_access_reservation_required'
  | 'poi_access_risk'
  | 'poi_access_unknown'
  | 'experience_regret_unconfirmed';

export interface PoiAccessCrowdingView {
  crowdLevel?: PoiCrowdLevel;
  predictedWaitP50?: number;
  predictedWaitP90?: number;
  /** 有 wait 预测时必填 */
  disclosureLabel?: string;
}

export interface PoiAccessEvaluationView {
  verdict: AccessCapacityEvaluationResult['verdict'];
  poiId: string;
  message: string;
  confidence: AccessCapacityEvaluationResult['confidence'];
  planBHints: AccessCapacityPlanB[];
  crowding?: PoiAccessCrowdingView;
  bottleneckResource?: PoiAccessTargetResource;
  bottleneckRuleType?: AccessCapacityEvaluationResult['bottleneckRuleType'];
}

export interface VisitorAccessPayload {
  evaluation: PoiAccessEvaluationView;
  hasReservationEvidence?: boolean;
  deferredLive?: boolean;
}

export interface PoiAccessTripEvaluation {
  tripItemId: string;
  tripDayId: string;
  dayNumber: number;
  poiId: string;
  poiName: string;
  dateISO: string;
  arrivalTime: string;
  raw: AccessCapacityEvaluationResult;
  hasReservationEvidence: boolean;
}

export interface GateExecuteReason {
  code: 'access_hard_blocked' | 'experience_regret_unconfirmed';
  issueId?: string;
  message: string;
}

export interface GateExecuteStatus {
  blocked: boolean;
  reasons: GateExecuteReason[];
}

export const NON_GATING_MUST_HANDLE_KINDS = new Set<FeasibilityPoiAccessIssueKind>([
  'poi_access_reservation_required',
]);

export function buildDisclosureLabel(
  signalSources: AccessCapacityEvaluationResult['signalSources'],
): string {
  if (signalSources.includes('BOOKING') || signalSources.includes('PARKA')) {
    return '（基于预约库存预测）';
  }
  if (signalSources.includes('MODEL')) return '（基于模型推断）';
  if (signalSources.includes('USER')) return '（基于近期游客反馈）';
  if (signalSources.includes('TRAFFIC')) return '（基于车流数据）';
  return '（基于模型推断）';
}

export function toPoiAccessEvaluationView(
  raw: AccessCapacityEvaluationResult,
): PoiAccessEvaluationView {
  const hasWait =
    raw.predictedWaitP50 != null || raw.predictedWaitP90 != null;
  const crowding =
    raw.crowdLevel || hasWait
      ? {
          crowdLevel: raw.crowdLevel,
          predictedWaitP50: raw.predictedWaitP50,
          predictedWaitP90: raw.predictedWaitP90,
          ...(hasWait
            ? { disclosureLabel: buildDisclosureLabel(raw.signalSources) }
            : {}),
        }
      : undefined;

  return {
    verdict: raw.verdict,
    poiId: raw.poiId,
    message: raw.reason,
    confidence: raw.confidence,
    planBHints: raw.planB,
    crowding,
    bottleneckResource: raw.bottleneckResource,
    bottleneckRuleType: raw.bottleneckRuleType,
  };
}

export function mapAccessVerdictToIssueKind(
  verdict: AccessCapacityEvaluationResult['verdict'],
): FeasibilityPoiAccessIssueKind | undefined {
  switch (verdict) {
    case 'BLOCKED':
      return 'poi_access_blocked';
    case 'RESERVATION_REQUIRED':
      return 'poi_access_reservation_required';
    case 'NEEDS_CONFIRMATION':
      return 'poi_access_unknown';
    case 'FEASIBLE_WITH_RISK':
      return 'poi_access_risk';
    default:
      return undefined;
  }
}
