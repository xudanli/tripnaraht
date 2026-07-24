/**
 * 行程 POI 准入校验（itinerary.verify 共用）
 */

import type { Itinerary } from '../interfaces/trip-plan.interface';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import type { ConstraintViolation } from '../services/route-feasibility.types';
import type {
  AccessCapacityEvaluationResult,
  PoiAccessRule,
  PoiCapacitySnapshot,
  PoiCrowdingSnapshot,
  AccessCapacityEvaluationInput,
} from '../../poi-access-capacity/interfaces/poi-access-capacity.interface';
import { evaluatePoiAccessCapacity } from '../../poi-access-capacity/utils/evaluate-poi-access.util';
import { resolvePoiAccessSlug } from '../../poi-access-capacity/utils/resolve-poi-slug.util';
import {
  parseItineraryWindowInDestinationLocal,
  resolveDestinationTimezoneForVerify,
} from './verify-opening-hours-timezone.util';

export type ItineraryPoiAccessVerifyIssue = {
  type: 'POI_ACCESS_BLOCKED' | 'POI_ACCESS_RISK' | 'POI_ACCESS_UNCONFIRMED';
  severity: 'ERROR' | 'WARNING';
  item_id?: string;
  day?: string;
  message: string;
  suggestion?: string;
  evaluation?: AccessCapacityEvaluationResult;
  violation?: ConstraintViolation;
};

function mapVerdictToConstraintId(
  evaluation: AccessCapacityEvaluationResult,
): string {
  if (evaluation.verdict === 'RESERVATION_REQUIRED') {
    return evaluation.bottleneckRuleType === 'PARKING_RESERVATION'
      ? CONSTRAINT_IDS.ENTITY_PARKING_RESERVATION_MISSING
      : CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION;
  }
  if (evaluation.verdict === 'BLOCKED') {
    switch (evaluation.bottleneckRuleType) {
      case 'SEASONAL_CLOSURE':
      case 'CLOSED':
      case 'TRAIL_RESTRICTION':
      case 'SAFETY_RESTRICTION':
        return CONSTRAINT_IDS.ENTITY_ACCESS_BLOCKED;
      case 'PARKING_RESERVATION':
        return CONSTRAINT_IDS.ENTITY_PARKING_RESERVATION_MISSING;
      case 'VEHICLE_RESTRICTION':
        return CONSTRAINT_IDS.ENTITY_VEHICLE_INCOMPATIBLE;
      default:
        return evaluation.bottleneckRuleType === 'RESERVATION_REQUIRED'
          ? CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION
          : CONSTRAINT_IDS.ENTITY_INVENTORY_SOLD_OUT;
    }
  }
  if (evaluation.verdict === 'NEEDS_CONFIRMATION') {
    return CONSTRAINT_IDS.ENTITY_ACCESS_STATUS_STALE;
  }
  return CONSTRAINT_IDS.ENTITY_PARKING_WAIT_HIGH;
}

function buildViolation(
  evaluation: AccessCapacityEvaluationResult,
  itemId?: string,
): ConstraintViolation {
  const constraintId = mapVerdictToConstraintId(evaluation);
  return {
    anchor: { constraintId, ruleId: 'poi_access_capacity_v1' },
    entityRef: { type: 'POI', id: itemId ?? evaluation.poiId },
    evidence: {
      source: 'RULE',
      refIds: evaluation.blockingRuleIds,
      quality: { confidence01: evaluation.confidence === 'OFFICIAL' ? 0.95 : 0.7 },
    },
    scope: 'LOCAL',
    suggestedActions: evaluation.planB.map((p) => ({
      action:
        p.action === 'BOOK_NOW'
          ? 'ASK_USER'
          : p.action === 'CHANGE_DATE' || p.action === 'USE_ALTERNATIVE'
            ? 'REPLACE'
            : 'REORDER',
      detail: p.detail,
    })),
  };
}

export type CollectItineraryPoiAccessVerifyIssuesParams = {
  itinerary: Itinerary;
  researchData?: Record<string, unknown>;
  rulesByPoiSlug?: Map<string, PoiAccessRule[]>;
  capacityByPoiDate?: Map<string, PoiCapacitySnapshot[]>;
  crowdingByPoiSlug?: Map<string, PoiCrowdingSnapshot>;
  vehicleType?: string;
  userReservations?: AccessCapacityEvaluationInput['userReservations'];
  staleRuleDays?: number;
};

/** 对 itinerary 做 POI 准入/容量校验 */
export function collectItineraryPoiAccessVerifyIssues(
  params: CollectItineraryPoiAccessVerifyIssuesParams,
): ItineraryPoiAccessVerifyIssue[] {
  const { itinerary, researchData } = params;
  const issues: ItineraryPoiAccessVerifyIssue[] = [];
  const timezone = resolveDestinationTimezoneForVerify({ researchData });

  const rulesFromResearch = researchData?.poi_access_rules as
    | PoiAccessRule[]
    | undefined;
  const rulesMap =
    params.rulesByPoiSlug ??
    (rulesFromResearch
      ? new Map<string, PoiAccessRule[]>(
          rulesFromResearch.reduce<[string, PoiAccessRule[]][]>((acc, r) => {
            const existing = acc.find(([k]) => k === r.poiId);
            if (existing) existing[1].push(r);
            else acc.push([r.poiId, [r]]);
            return acc;
          }, []),
        )
      : undefined);

  if (!rulesMap?.size) return issues;

  const vehicleType =
    params.vehicleType ??
    (typeof researchData?.vehicle_type === 'string'
      ? researchData.vehicle_type
      : undefined);

  const userReservations =
    params.userReservations ??
    (Array.isArray(researchData?.user_reservations)
      ? (researchData.user_reservations as CollectItineraryPoiAccessVerifyIssuesParams['userReservations'])
      : undefined);

  for (const day of itinerary.days ?? []) {
    const dayIso = String(day.date ?? '').slice(0, 10);
    if (!dayIso) continue;

    for (const item of day.items ?? []) {
      const itemType = String(item.type ?? 'POI').toUpperCase();
      if (
        itemType !== 'POI' &&
        itemType !== 'ACTIVITY' &&
        itemType !== 'VIEWPOINT' &&
        itemType !== 'NATURE'
      ) {
        continue;
      }

      const name = item.location_ref?.name;
      const poiSlug = resolvePoiAccessSlug({
        placeId: item.location_ref?.place_id,
        name,
        metadata: item.location_ref as Record<string, unknown> | undefined,
      });
      if (!poiSlug) continue;

      const rules = rulesMap.get(poiSlug);
      if (!rules?.length) continue;

      const startWindow = item.start_window ?? '10:00';
      const startDt = parseItineraryWindowInDestinationLocal(
        dayIso,
        startWindow,
        timezone,
      );
      const arrivalTime = startDt
        ? `${String(startDt.hour).padStart(2, '0')}:${String(startDt.minute).padStart(2, '0')}`
        : startWindow;

      const capacityKey = `${poiSlug}:${dayIso}`;
      const capacitySnapshots =
        params.capacityByPoiDate?.get(capacityKey) ??
        (Array.isArray(researchData?.poi_capacity_snapshots)
          ? (researchData.poi_capacity_snapshots as PoiCapacitySnapshot[]).filter(
              (s) => s.poiId === poiSlug && s.dateISO.slice(0, 10) === dayIso,
            )
          : undefined);

      const crowdingSnapshot =
        params.crowdingByPoiSlug?.get(poiSlug) ??
        (researchData?.poi_crowding_snapshots &&
        typeof researchData.poi_crowding_snapshots === 'object'
          ? (researchData.poi_crowding_snapshots as Record<string, PoiCrowdingSnapshot>)[
              poiSlug
            ]
          : undefined);

      const evaluation = evaluatePoiAccessCapacity({
        poiId: poiSlug,
        poiName: name,
        dateISO: dayIso,
        arrivalTime,
        timezone,
        vehicleType,
        userReservations,
        rules,
        capacitySnapshots,
        crowdingSnapshot,
        staleRuleDays: params.staleRuleDays,
      });

      if (evaluation.verdict === 'FEASIBLE') continue;

      const suggestion = evaluation.planB.map((p) => p.detail).join('；');

      if (evaluation.verdict === 'BLOCKED') {
        issues.push({
          type: 'POI_ACCESS_BLOCKED',
          severity: 'ERROR',
          item_id: item.id,
          day: day.date,
          message: evaluation.reason,
          suggestion: suggestion || undefined,
          evaluation,
          violation: buildViolation(evaluation, item.id),
        });
        continue;
      }

      if (evaluation.verdict === 'RESERVATION_REQUIRED') {
        issues.push({
          type: 'POI_ACCESS_BLOCKED',
          severity: 'ERROR',
          item_id: item.id,
          day: day.date,
          message: evaluation.reason,
          suggestion: suggestion || undefined,
          evaluation,
          violation: buildViolation(evaluation, item.id),
        });
        continue;
      }

      if (evaluation.verdict === 'NEEDS_CONFIRMATION') {
        issues.push({
          type: 'POI_ACCESS_UNCONFIRMED',
          severity: 'WARNING',
          item_id: item.id,
          day: day.date,
          message: evaluation.reason,
          suggestion: suggestion || '出发前确认官方最新公告',
          evaluation,
          violation: buildViolation(evaluation, item.id),
        });
        continue;
      }

      issues.push({
        type: 'POI_ACCESS_RISK',
        severity: 'WARNING',
        item_id: item.id,
        day: day.date,
        message: evaluation.reason,
        suggestion: suggestion || undefined,
        evaluation,
        violation: buildViolation(evaluation, item.id),
      });
    }
  }

  return issues;
}

/** 从 itinerary 提取涉及的 poi slug 列表 */
export function collectPoiAccessSlugsFromItinerary(
  itinerary: Itinerary,
): string[] {
  const slugs = new Set<string>();
  for (const day of itinerary.days ?? []) {
    for (const item of day.items ?? []) {
      const slug = resolvePoiAccessSlug({
        placeId: item.location_ref?.place_id,
        name: item.location_ref?.name,
        metadata: item.location_ref as Record<string, unknown> | undefined,
      });
      if (slug) slugs.add(slug);
    }
  }
  return [...slugs];
}
