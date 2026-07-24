/**
 * itinerary.verify 结构化 issue → VerificationIssue（保留 POI Access violation）
 */

import type { VerificationIssue } from '../../decision/kernel/decision-state.types';
import { classifyVerificationIssueFromText } from '../execution/verification-issue.rules';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import type { ConstraintViolation } from '../services/route-feasibility.types';

import type { AccessCapacityEvaluationResult } from '../../poi-access-capacity/interfaces/poi-access-capacity.interface';

export type ItineraryVerifyIssueLike = {
  type?: string;
  severity?: string;
  item_id?: string;
  day?: string;
  message?: string;
  suggestion?: string;
  violation?: ConstraintViolation;
  evaluation?: AccessCapacityEvaluationResult;
};

function mapPoiAccessTypeToCode(type: string): VerificationIssue['code'] {
  switch (type) {
    case 'POI_ACCESS_BLOCKED':
      return 'POI_CLOSED';
    case 'POI_ACCESS_UNCONFIRMED':
      return 'UNKNOWN';
    case 'POI_ACCESS_RISK':
      return 'CONFIDENCE_DEGRADED' as VerificationIssue['code'];
    default:
      return 'UNKNOWN';
  }
}

function mapSeverity(severity?: string): VerificationIssue['class'] {
  if (severity === 'CRITICAL' || severity === 'ERROR') return 'CONFLICT';
  if (severity === 'WARNING') return 'ADVISORY';
  return 'ADVISORY';
}

/** 将 itinerary.verify issue 转为带 violation 的 VerificationIssue */
export function mapItineraryVerifyIssueToVerificationIssue(
  raw: ItineraryVerifyIssueLike,
  source = 'ITINERARY_VERIFY_SKILL',
): VerificationIssue | undefined {
  const message = String(raw.message ?? '').trim();
  if (!message) return undefined;

  if (raw.type?.startsWith('POI_ACCESS_')) {
    const violation = raw.violation;
    const cid = violation?.anchor?.constraintId;
    let code = mapPoiAccessTypeToCode(raw.type);

    if (cid === CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION ||
        cid === CONSTRAINT_IDS.ENTITY_PARKING_RESERVATION_MISSING ||
        cid === CONSTRAINT_IDS.ENTITY_INVENTORY_SOLD_OUT) {
      code = 'TIME_WINDOW_BREACH';
    }
    if (cid === CONSTRAINT_IDS.ENTITY_VEHICLE_INCOMPATIBLE) {
      code = 'ROUTE_INFEASIBLE';
    }

    const replacePlan = raw.evaluation?.planB.find((p) => p.alternativePoiId);
    return {
      code,
      class: raw.type === 'POI_ACCESS_RISK' ? 'ADVISORY' : mapSeverity(raw.severity),
      message: raw.suggestion ? `${message}；${raw.suggestion}` : message,
      source: source as VerificationIssue['source'],
      at: new Date().toISOString(),
      entityRef: {
        type: 'POI',
        id: raw.item_id ?? violation?.entityRef?.id,
      },
      suggestedActions: violation?.suggestedActions ?? undefined,
      confidence01: violation?.evidence?.quality?.confidence01 ?? 0.85,
      metadata: {
        ...(violation ? { poi_access_constraint_id: violation.anchor?.constraintId } : {}),
        ...(replacePlan?.alternativePoiId
          ? {
              poi_access_alternative_poi_id: replacePlan.alternativePoiId,
              poi_access_blocked_poi_id: raw.evaluation?.poiId,
            }
          : {}),
      },
    };
  }

  return classifyVerificationIssueFromText({
    text: message,
    source: source as VerificationIssue['source'],
  });
}
