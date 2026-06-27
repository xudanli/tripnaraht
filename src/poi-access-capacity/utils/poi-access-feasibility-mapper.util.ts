/**
 * PoiAccessTripEvaluation → FeasibilityIssueDto
 */

import type { FeasibilityIssueDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { PoiAccessTripEvaluation } from '../types/poi-access-readiness.types';
import {
  mapAccessVerdictToIssueKind,
  toPoiAccessEvaluationView,
  type FeasibilityPoiAccessIssueKind,
  type VisitorAccessPayload,
} from '../types/poi-access-readiness.types';
import type { PoiAccessRule } from '../interfaces/poi-access-capacity.interface';
import { ICELAND_A_TIER_POI_SLUGS } from '../fixtures/is-a-tier.rules';

function issuePriority(kind: FeasibilityPoiAccessIssueKind): FeasibilityIssueDto['priority'] {
  switch (kind) {
    case 'poi_access_blocked':
    case 'poi_access_reservation_required':
      return 'must_handle';
    case 'poi_access_unknown':
      return 'pending_confirm';
    default:
      return 'suggest_adjust';
  }
}

function issueSeverity(kind: FeasibilityPoiAccessIssueKind): FeasibilityIssueDto['severity'] {
  return kind === 'poi_access_blocked' ? 'high' : kind === 'poi_access_risk' ? 'medium' : 'high';
}

function buildRepairOptions(
  evalRow: PoiAccessTripEvaluation,
  rules: PoiAccessRule[],
): FeasibilityIssueDto['repairOptions'] {
  const rule =
    rules.find((r) => r.poiId === evalRow.poiId && r.sourceUrl) ??
    rules.find((r) => r.poiId === evalRow.poiId);
  const options: NonNullable<FeasibilityIssueDto['repairOptions']> = [];

  if (rule?.sourceUrl) {
    options.push({
      id: `book_parking_${evalRow.tripItemId}`,
      label: rule.targetResource === 'PARKING' ? '前往预约停车' : '前往官方预订',
      description: rule.notes ?? '打开官方预订页面',
      type: 'book_parking',
      actionType: 'external_link',
      payload: { externalUrl: rule.sourceUrl },
    });
  }

  options.push({
    id: `manual_confirm_${evalRow.tripItemId}`,
    label: '我已预约，上传凭证',
    description: '填写确认码后清除此项待办',
    type: 'manual_confirm',
    actionType: 'manual_confirm',
    payload: {
      tripItemId: evalRow.tripItemId,
      poiId: evalRow.poiId,
      dateISO: evalRow.dateISO,
      plannedArrival: evalRow.arrivalTime,
      resource: evalRow.raw.bottleneckResource ?? 'PARKING',
      /** 前端 CTA：打开凭证弹窗，勿直接 apply-repair（需用户填 confirmationCode） */
      ctaHandler: 'open_reservation_evidence_modal',
    },
  });

  for (const hint of evalRow.raw.planB) {
    if (hint.action === 'USE_ALTERNATIVE' && hint.alternativePoiId) {
      options.push({
        id: `use_alternative_${hint.alternativePoiId}`,
        label: '改选替代景点',
        description: hint.detail,
        type: 'replace_poi',
        actionType: 'REPLACE',
        payload: { alternativePoiId: hint.alternativePoiId },
      });
    }
  }

  return options;
}

export function poiAccessEvaluationToFeasibilityIssue(
  evalRow: PoiAccessTripEvaluation,
  rules: PoiAccessRule[],
): FeasibilityIssueDto | undefined {
  const kind = mapAccessVerdictToIssueKind(evalRow.raw.verdict);
  if (!kind) return undefined;

  const evaluationView = toPoiAccessEvaluationView(evalRow.raw);
  const visitorAccess: VisitorAccessPayload = {
    evaluation: evaluationView,
    hasReservationEvidence: evalRow.hasReservationEvidence,
  };

  const issueId = `poi-access:${evalRow.tripItemId}:${kind}`;

  return {
    id: issueId,
    priority: issuePriority(kind),
    category: 'access_capacity',
    issueKind: kind,
    title:
      kind === 'poi_access_reservation_required'
        ? `${evalRow.poiName}：需要预约`
        : kind === 'poi_access_blocked'
          ? `${evalRow.poiName}：暂不可执行`
          : `${evalRow.poiName}：准入提示`,
    message: evalRow.raw.reason,
    affectedDays: [evalRow.dayNumber],
    tripDayId: evalRow.tripDayId,
    severity: issueSeverity(kind),
    fromItemId: evalRow.tripItemId,
    uiHints: {
      primaryAction:
        kind === 'poi_access_reservation_required' ? 'manual_confirm' : 'view_plan_b',
      ctaModal:
        kind === 'poi_access_reservation_required' ? 'reservation_evidence' : undefined,
      reservationEvidenceForm:
        kind === 'poi_access_reservation_required'
          ? {
              tripItemId: evalRow.tripItemId,
              poiId: evalRow.poiId,
              dateISO: evalRow.dateISO,
              plannedArrival: evalRow.arrivalTime,
              resource: evalRow.raw.bottleneckResource ?? 'PARKING',
            }
          : undefined,
      deepLink: {
        tab: 'schedule',
        dayIndex: Math.max(0, evalRow.dayNumber - 1),
        highlightItemIds: [evalRow.tripItemId],
      },
    },
    repairOptions:
      kind === 'poi_access_reservation_required' || kind === 'poi_access_blocked'
        ? buildRepairOptions(evalRow, rules)
        : undefined,
    proofs: [
      {
        itemId: evalRow.tripItemId,
        placeLabel: evalRow.poiName,
        entity: evalRow.poiId,
        constraint: evalRow.raw.bottleneckRuleType ?? 'ACCESS',
        currentFact: evalRow.raw.reason,
        evidenceSource: evalRow.raw.confidence,
        evidenceType: 'poi_access_capacity',
        conclusion: evalRow.raw.verdict,
      },
    ],
    visitorAccess,
  };
}

export function buildExperienceRegretIssue(input: {
  tripId: string;
  planRegretEstimate: number;
  confirmedUpperBound?: number;
}): FeasibilityIssueDto | undefined {
  if (input.confirmedUpperBound != null) {
    if (input.planRegretEstimate > input.confirmedUpperBound) {
      return {
        id: `experience-regret:warning:${input.tripId}`,
        priority: 'suggest_adjust',
        category: 'experience_expectation',
        issueKind: 'experience_regret_warning',
        title: '体验风险略高于您确认的底线',
        message: `预估遗憾指数 ${input.planRegretEstimate} 高于确认上限 ${input.confirmedUpperBound}（仅提示，不阻止出发）`,
        affectedDays: [],
        severity: 'medium',
      };
    }
    return undefined;
  }

  return {
    id: `experience-regret:unconfirmed:${input.tripId}`,
    priority: 'must_handle',
    category: 'experience_expectation',
    issueKind: 'experience_regret_unconfirmed',
    title: '请确认体验底线',
    message: '出发前请确认你可接受的体验遗憾上限，以便系统给出更匹配的风险提示',
    affectedDays: [],
    severity: 'high',
    uiHints: { primaryAction: 'confirm_regret_bound' },
    repairOptions: [
      {
        id: 'confirm_regret_bound',
        label: '确认体验底线',
        description: '选择可接受的遗憾上限（15% / 30% / 45%）',
        type: 'confirm_regret_bound',
        actionType: 'confirm_regret_bound',
      },
    ],
  };
}

export function landmannalaugarParkaUrl(): string {
  const rule = rulesFindLandmannalaugar();
  return rule?.sourceUrl ?? 'https://www.parka.is/place/landmannalaugar/';
}

function rulesFindLandmannalaugar(): PoiAccessRule | undefined {
  return {
    poiId: ICELAND_A_TIER_POI_SLUGS.LANDMANNALAUGAR,
    sourceUrl: 'https://www.parka.is/place/landmannalaugar/',
  } as PoiAccessRule;
}
