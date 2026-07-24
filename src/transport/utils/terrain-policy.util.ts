/**
 * Server-side terrain / DEM policy — replaces client includeTerrain=1 as the SSOT trigger.
 */

import type { TerrainPolicyMode } from '../contracts/travel-eta.contract';

export interface TerrainPolicyContext {
  /** Explicit override from caller (AUTO | REQUIRED | SKIP) */
  terrainPolicy?: TerrainPolicyMode;
  /** Legacy query param — maps to REQUIRED when true */
  includeTerrain?: boolean;
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
  countryCode?: string;
  isFRoad?: boolean;
  highlandRisk?: boolean;
  roadId?: string;
  activityType?: string;
  /** Constraint / Abu / vehicle-fit asked for terrain evidence */
  needsTerrainEvidence?: boolean;
  needsVehicleFit?: boolean;
  /** Straight-line or route distance meters (short urban hops can SKIP under AUTO) */
  distanceM?: number;
}

export type TerrainPolicyDecision = {
  mode: TerrainPolicyMode;
  /** Whether DEM profile should run */
  runDem: boolean;
  /** Missing DEM is a hard gate (not silent continue) */
  demRequired: boolean;
  reasons: string[];
};

/** Iceland mainland approx (same band as DEMElevationService). */
export function isIcelandCoords(lat: number, lng: number): boolean {
  return lat >= 63.3 && lat <= 66.5 && lng >= -24.5 && lng <= -13.5;
}

/** Interior highlands corridor proxy (F-road / highland risk heuristic). */
export function isIcelandHighlandsApprox(lat: number, lng: number): boolean {
  return isIcelandCoords(lat, lng) && lat >= 63.9 && lat <= 65.3 && lng >= -20.8 && lng <= -17.2;
}

function looksLikeFRoadId(roadId?: string): boolean {
  if (!roadId) return false;
  return /^F\d+/i.test(roadId.trim()) || /f-?road/i.test(roadId);
}

function isTerrainSensitiveActivity(activityType?: string): boolean {
  if (!activityType) return false;
  return /hike|hiking|trek|off.?road|glacier|highland|4x4|f-?road/i.test(activityType);
}

/**
 * Resolve whether to run DEM for this segment.
 * AUTO: Iceland / F-road / highland / hiking / vehicle-fit / evidence request.
 * Short non-Iceland urban hops stay SKIP under AUTO.
 */
export function resolveTerrainPolicy(ctx: TerrainPolicyContext): TerrainPolicyDecision {
  if (ctx.terrainPolicy === 'SKIP') {
    return { mode: 'SKIP', runDem: false, demRequired: false, reasons: ['POLICY_SKIP'] };
  }
  if (ctx.terrainPolicy === 'REQUIRED' || ctx.includeTerrain === true) {
    return {
      mode: 'REQUIRED',
      runDem: true,
      demRequired: true,
      reasons: ctx.includeTerrain ? ['LEGACY_INCLUDE_TERRAIN'] : ['POLICY_REQUIRED'],
    };
  }

  const reasons: string[] = [];
  const midLat =
    ctx.origin && ctx.destination
      ? (ctx.origin.lat + ctx.destination.lat) / 2
      : ctx.origin?.lat ?? ctx.destination?.lat;
  const midLng =
    ctx.origin && ctx.destination
      ? (ctx.origin.lng + ctx.destination.lng) / 2
      : ctx.origin?.lng ?? ctx.destination?.lng;

  const inIceland =
    ctx.countryCode?.toUpperCase() === 'IS' ||
    (midLat != null && midLng != null && isIcelandCoords(midLat, midLng));
  if (inIceland) reasons.push('ICELAND');

  if (ctx.isFRoad || looksLikeFRoadId(ctx.roadId)) reasons.push('F_ROAD');
  if (
    ctx.highlandRisk ||
    (midLat != null && midLng != null && isIcelandHighlandsApprox(midLat, midLng))
  ) {
    reasons.push('HIGHLAND');
  }
  if (isTerrainSensitiveActivity(ctx.activityType)) reasons.push('ACTIVITY');
  if (ctx.needsTerrainEvidence) reasons.push('EVIDENCE_REQUEST');
  if (ctx.needsVehicleFit) reasons.push('VEHICLE_FIT');

  const demRequired =
    reasons.includes('F_ROAD') ||
    reasons.includes('HIGHLAND') ||
    reasons.includes('ACTIVITY') ||
    reasons.includes('VEHICLE_FIT');

  if (reasons.length === 0) {
    // Short urban / non-Iceland: skip
    const shortHop = (ctx.distanceM ?? 0) > 0 && (ctx.distanceM as number) < 15_000;
    if (shortHop || !inIceland) {
      return { mode: 'AUTO', runDem: false, demRequired: false, reasons: ['AUTO_SKIP_LOW_RISK'] };
    }
  }

  if (reasons.length > 0) {
    return { mode: 'AUTO', runDem: true, demRequired, reasons };
  }

  return { mode: 'AUTO', runDem: false, demRequired: false, reasons: ['AUTO_SKIP_DEFAULT'] };
}
