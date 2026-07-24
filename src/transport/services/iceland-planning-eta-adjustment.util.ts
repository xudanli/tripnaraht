/**
 * Iceland L2 planning ETA — time buffers vs admission gates.
 * Does NOT mix L3 realtime weather / live congestion.
 */

import {
  applyPlanningAdjustments,
  type TravelEtaAdjustmentReason,
  type TravelEtaAuthority,
  type TravelEtaEnvelopeV1,
  type TravelEtaSchedulability,
  type TravelSegmentTerrainV1,
} from '../contracts/travel-eta.contract';
import { isIcelandCoords, isIcelandHighlandsApprox } from '../utils/terrain-policy.util';

export type IcelandL2Vehicle = '2WD' | '4WD' | string;
export type IcelandL2RoadStatus = 'OPEN' | 'SEASONAL' | 'CLOSED' | string;
export type IcelandL2Decision = 'ALLOW' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | 'REJECT';

export interface IcelandPlanningEtaAdjustmentInput {
  baseEta: TravelEtaEnvelopeV1;
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  vehicle?: IcelandL2Vehicle;
  roadStatus?: IcelandL2RoadStatus;
  roadId?: string;
  isFRoad?: boolean;
  highlandRisk?: boolean;
  /** Calendar month 1–12 */
  month?: number;
  terrain?: TravelSegmentTerrainV1 | null;
  authority?: TravelEtaAuthority;
  /** Paved ring-road / urban — do not apply highland buffers */
  pavedRingRoad?: boolean;
}

export interface IcelandPlanningEtaAdjustmentResult {
  eta: TravelEtaEnvelopeV1;
  decision: IcelandL2Decision;
  reasons: string[];
  /** Time deltas only — never used as a substitute for REJECT/CLOSED */
  appliedTimeAdjustments: boolean;
}

function looksLikeFRoad(roadId?: string, isFRoad?: boolean): boolean {
  if (isFRoad) return true;
  if (!roadId) return false;
  return /^F\d+/i.test(roadId.trim());
}

function isWinterishMonth(month?: number): boolean {
  if (month == null) return false;
  return month <= 4 || month >= 11;
}

/**
 * Pure L2 adjuster: may add planning minutes OR set BLOCKED schedulability.
 * CLOSED / 2WD-on-F-road must not invent a schedulable inflated ETA.
 */
export function applyIcelandPlanningEtaAdjustment(
  input: IcelandPlanningEtaAdjustmentInput,
): IcelandPlanningEtaAdjustmentResult {
  const reasons: string[] = [];
  const adjustments: Array<{
    reason: TravelEtaAdjustmentReason;
    deltaMin: number;
    evidenceRef?: string;
  }> = [];

  const midLat =
    input.origin && input.destination
      ? (input.origin.lat + input.destination.lat) / 2
      : input.origin?.lat ?? input.destination?.lat;
  const midLng =
    input.origin && input.destination
      ? (input.origin.lng + input.destination.lng) / 2
      : input.origin?.lng ?? input.destination?.lng;

  const inIceland =
    (midLat != null && midLng != null && isIcelandCoords(midLat, midLng)) ||
    !!input.isFRoad ||
    looksLikeFRoad(input.roadId);

  const highland =
    input.highlandRisk ||
    (midLat != null && midLng != null && isIcelandHighlandsApprox(midLat, midLng));

  const fRoad = looksLikeFRoad(input.roadId, input.isFRoad) || (highland && !input.pavedRingRoad);
  const roadStatus = (input.roadStatus ?? 'OPEN').toUpperCase();
  const vehicle = (input.vehicle ?? '4WD').toUpperCase();
  const terrain = input.terrain ?? input.baseEta.terrain;
  const authority = input.authority ?? input.baseEta.authority ?? 'SHADOW';

  // --- Admission gates (not time) ---
  let decision: IcelandL2Decision = 'ALLOW';
  let schedulability: TravelEtaSchedulability = 'SCHEDULABLE';
  const gateReasons: string[] = [];

  if (fRoad && vehicle === '2WD') {
    gateReasons.push('OFFICIAL_IS_FROAD_2WD');
    decision = 'REJECT';
    schedulability = 'BLOCKED';
  }
  if (roadStatus === 'CLOSED') {
    gateReasons.push(input.roadId ? `ROAD_CLOSED_${input.roadId}` : 'ROAD_CLOSED');
    if (fRoad) gateReasons.push('REROUTE_OFF_FROAD');
    decision = decision === 'REJECT' && vehicle === '2WD' ? 'REJECT' : 'SUGGEST_REPLACE';
    if (vehicle === '2WD' && fRoad) decision = 'REJECT';
    schedulability = 'BLOCKED';
  }
  if (terrain?.demSource === 'NONE' && (fRoad || highland || input.highlandRisk) && !input.pavedRingRoad) {
    gateReasons.push('E_DEM_MISSING');
    decision = 'REJECT';
    schedulability = 'BLOCKED';
  }

  // --- Time adjustments only when not forged for closed/mismatch ---
  const mayAddTime = inIceland && !input.pavedRingRoad && schedulability !== 'BLOCKED';

  if (mayAddTime && fRoad) {
    adjustments.push({ reason: 'F_ROAD', deltaMin: 30, evidenceRef: input.roadId ?? 'F_ROAD' });
  }
  if (mayAddTime && !fRoad && highland) {
    adjustments.push({
      reason: 'SEASONAL_UNCERTAINTY',
      deltaMin: 10,
      evidenceRef: 'HIGHLAND_ROUTE',
    });
  }
  if (
    mayAddTime &&
    (roadStatus === 'SEASONAL' || (fRoad && isWinterishMonth(input.month)))
  ) {
    adjustments.push({ reason: 'SEASONAL_UNCERTAINTY', deltaMin: 15 });
    if (isWinterishMonth(input.month)) reasons.push('WINTER_FROAD_SEASONAL');
  }
  if (mayAddTime && terrain && terrain.maxSlopePct >= 10) {
    adjustments.push({
      reason: 'STEEP_TERRAIN',
      deltaMin: 10,
      evidenceRef: 'DEM_MAX_SLOPE',
    });
  }
  if (mayAddTime && terrain && (terrain.ascentM + terrain.descentM) >= 800) {
    adjustments.push({
      reason: 'TERRAIN_COMPLEXITY',
      deltaMin: 10,
      evidenceRef: terrain.demSource,
    });
  }
  if (terrain?.demSource === 'geo_dem_global') {
    adjustments.push({ reason: 'DATA_UNCERTAINTY', deltaMin: mayAddTime ? 10 : 0 });
    reasons.push('DEM_GLOBAL_FALLBACK');
    if (decision === 'ALLOW') decision = 'NEED_CONFIRM';
  }

  reasons.push(...gateReasons);

  let confidence = input.baseEta.confidence;
  if (terrain?.demSource === 'geo_dem_global') {
    confidence = Math.min(confidence, 0.55);
  }
  if (terrain?.demSource === 'NONE') {
    confidence = Math.min(confidence, 0.35);
  }
  if (input.baseEta.providerTraceStatus === 'UNKNOWN' || input.baseEta.provenance.provider === 'UNKNOWN') {
    confidence = Math.min(confidence, 0.5);
    reasons.push('PROVIDER_UNKNOWN');
  }

  const eta = applyPlanningAdjustments(
    { ...input.baseEta, ...(terrain ? { terrain } : {}) },
    adjustments.filter((a) => a.deltaMin !== 0),
    {
      confidence,
      authority,
      schedulability,
      gateReasons,
    },
  );

  if (decision === 'ALLOW' && reasons.includes('WINTER_FROAD_SEASONAL')) {
    decision = 'NEED_CONFIRM';
  }

  return {
    eta,
    decision,
    reasons: [...new Set(reasons)],
    appliedTimeAdjustments: adjustments.some((a) => a.deltaMin > 0),
  };
}
