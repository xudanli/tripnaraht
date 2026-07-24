/**
 * ITINERARY_ADJUST + 邻日走廊：勿继承 trip.region_id 的黄金圈骨架，除非用户原文明确区域意图。
 */

import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunIntentAnalysis } from './route-and-run-intent-analyzer.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

/** 南岸→半岛走廊改排时默认排除的内陆黄金圈锚点 slug */
export const GOLDEN_CIRCLE_SLUGS_EXCLUDED_ON_CORRIDOR_ADJUST = [
  'thingvellir',
  'geysir',
  'gullfoss',
  'kerid_crater',
  'secret_lagoon',
  'fridheimar',
  'bruarfoss',
] as const;

export function isItineraryAdjustCorridorPoiPlanningMode(params: {
  routeIntentPrimary?: string;
  neighborAnchorsPresent?: boolean;
}): boolean {
  if (params.routeIntentPrimary !== 'ITINERARY_ADJUST') return false;
  return params.neighborAnchorsPresent !== false;
}

/**
 * 用户只说「优化第 N 天」而未提黄金圈/具体区域时，返回 true（应走走廊 POI，不用 trip region_id）。
 */
export function shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning(
  intakeMessage: string | undefined,
  resolveRegionFromText: (text: string) => { regionIntent?: { regionId: string }; confidence: number },
): boolean {
  const msg = stripSystemMessageBlocksForIntakeNl(String(intakeMessage ?? '')).trim();
  if (!msg) return true;
  const hit = resolveRegionFromText(msg);
  return !(hit.regionIntent && hit.confidence >= 0.65);
}

export function buildCorridorAdjustPoiPlanningSlice(params?: {
  totalBudgetMinutes?: number;
}): PoiPlanningDecisionSlice {
  const total = params?.totalBudgetMinutes ?? 600;
  const buffer = Math.round(total * 0.125);
  return {
    routeIntent: {
      regionId: 'itinerary_adjust_corridor',
      regionName: 'Corridor day replan',
      confidence: 1,
      mustCoverAnchors: false,
    },
    poiPlan: {
      requiredAnchorPoiIds: [],
      optionalCandidatePoiIds: [],
      excludedPoiIds: [...GOLDEN_CIRCLE_SLUGS_EXCLUDED_ON_CORRIDOR_ADJUST],
      selectedOptionalPoiIds: [],
    },
    schedulePlan: {
      totalBudgetMinutes: total,
      requiredCostMinutes: buffer,
      optionalCapacityMinutes: total - buffer,
      bufferMinutes: buffer,
      feasibility: 'ok',
    },
    budgetGateApplied: false,
    resolution: {
      source: 'region_intent_resolver',
      matchedBy: 'message_text',
      matchedRegionKeyword: 'itinerary_adjust_corridor',
    },
  };
}

export function resolveRouteIntentPrimary(
  metadata: Record<string, unknown> | undefined,
): RouteAndRunIntentAnalysis['primary'] | undefined {
  const ri = metadata?.route_and_run_intent as RouteAndRunIntentAnalysis | undefined;
  return ri?.primary;
}
