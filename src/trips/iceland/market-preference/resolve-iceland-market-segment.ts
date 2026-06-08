// src/trips/iceland/market-preference/resolve-iceland-market-segment.ts

import { loadIcelandMarketPreferenceMatrix } from './load-iceland-market-preference-matrix';
import { resolveRouteDirectionNameFromMarketCanonical } from './resolve-market-canonical-route.util';
import {
  inferVehicleClassFromQuery,
  isIcelandPlanningContext,
  localeMatchesPrefix,
  residencyMatchesSegment,
} from './infer-iceland-market-signals.util';
import type {
  IcelandMarketPreferenceMatrixV1,
  IcelandMarketRoutingInput,
  IcelandMarketSegmentId,
  IcelandMarketSegmentResolution,
} from './iceland-market-preference.types';

function seasonBucket(month: number | undefined, matrix: IcelandMarketPreferenceMatrixV1): string {
  if (!month) return '4-5_9-10';
  if (month >= 6 && month <= 8) return '6-8';
  if (month === 11 || month === 12 || month <= 3) return '11-3';
  return '4-5_9-10';
}

function seasonAffinity(
  month: number | undefined,
  segmentId: IcelandMarketSegmentId,
  matrix: IcelandMarketPreferenceMatrixV1,
): number {
  const bucket = seasonBucket(month, matrix);
  const row = matrix.season_cross_matrix[bucket];
  if (row?.[segmentId] != null) return row[segmentId];
  const seg = matrix.segments[segmentId];
  if (!month) return 0.5;
  if (seg.peak_months.includes(month)) return 1;
  if (seg.avoid_months.includes(month)) return 0.25;
  return 0.65;
}

function vehicleAffinity(
  vehicleClass: IcelandMarketRoutingInput['vehicleClass'],
  userQuery: string | undefined,
  segmentId: IcelandMarketSegmentId,
  matrix: IcelandMarketPreferenceMatrixV1,
): number {
  const vc = vehicleClass ?? inferVehicleClassFromQuery(userQuery) ?? '2wd';
  const aff = matrix.segments[segmentId].vehicle_affinities[vc];
  return aff ?? 0.5;
}

function scoreSegment(
  segmentId: IcelandMarketSegmentId,
  input: IcelandMarketRoutingInput,
  matrix: IcelandMarketPreferenceMatrixV1,
): number {
  const seg = matrix.segments[segmentId];
  const w = matrix.routing_weights;
  const residency = residencyMatchesSegment(input.residencyCountry, input.nationality, seg.residency_countries);
  const locale = localeMatchesPrefix(input.locale, seg.locale_prefixes);
  const season = seasonAffinity(input.month, segmentId, matrix);
  const vehicle = vehicleAffinity(input.vehicleClass, input.userQuery, segmentId, matrix);
  return residency * w.residency + locale * w.locale + season * w.season + vehicle * w.vehicle;
}

function buildPromptBlock(
  segmentId: IcelandMarketSegmentId,
  confidence: number,
  matrix: IcelandMarketPreferenceMatrixV1,
): string {
  const seg = matrix.segments[segmentId];
  return (
    `[IS_MARKET_PRIOR | segment=${segmentId} | confidence=${confidence.toFixed(2)}]\n` +
    `- Route shell: ${seg.canonical_route_id}; ${seg.label_zh}\n` +
    `- ${seg.prompt_template_zh}`
  );
}

const SEGMENT_IDS: IcelandMarketSegmentId[] = [
  'IS_MARKET_US',
  'IS_MARKET_UK',
  'IS_MARKET_DACH_NORDIC',
  'IS_MARKET_EAST_ASIA',
];

/**
 * 隐式画像路由：由常驻地/语言/月份/车型等软分类，不要求用户自选国籍。
 */
export function resolveIcelandMarketSegment(
  input: IcelandMarketRoutingInput,
): IcelandMarketSegmentResolution | null {
  if (!isIcelandPlanningContext(input)) {
    const hasMarketSignal =
      !!input.residencyCountry ||
      !!input.nationality ||
      !!input.locale ||
      input.month != null;
    if (!hasMarketSignal) return null;
  }

  const matrix = loadIcelandMarketPreferenceMatrix();
  const scored = SEGMENT_IDS.map((id) => ({ id, score: scoreSegment(id, input, matrix) })).sort(
    (a, b) => b.score - a.score,
  );

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < 0.2) return null;

  let confidence = top.score;
  if (isIcelandPlanningContext(input)) {
    confidence = Math.min(1, confidence + 0.08);
  }

  const blended =
    !!second && top.score - second.score < matrix.blend_threshold;

  const segmentId = top.id;
  const seg = matrix.segments[segmentId];

  const canonicalRouteId = seg.canonical_route_id;
  return {
    segmentId,
    confidence,
    blended,
    runnerUpSegmentId: second?.id,
    canonicalRouteId,
    routeDirectionName: resolveRouteDirectionNameFromMarketCanonical(canonicalRouteId),
    routeDirectionTagAffinities: { ...seg.route_direction_tags },
    preferredRouteTypes: seg.preferred_route_types,
    rentalIntentProfile: seg.rental_intent_profile,
    worldModelIntents: seg.world_model_intents ? { ...seg.world_model_intents } : undefined,
    promptBlockZh: buildPromptBlock(segmentId, confidence, matrix),
  };
}

export function getIcelandMarketApplyStrength(
  confidence: number,
  matrix: IcelandMarketPreferenceMatrixV1 = loadIcelandMarketPreferenceMatrix(),
): number {
  if (confidence >= matrix.confidence_apply_full) return 1;
  if (confidence >= matrix.confidence_apply_partial) {
    return (confidence - matrix.confidence_apply_partial) /
      (matrix.confidence_apply_full - matrix.confidence_apply_partial);
  }
  return 0;
}
