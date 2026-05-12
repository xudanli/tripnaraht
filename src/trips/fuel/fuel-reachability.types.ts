/**
 * P-FUEL-1 — Fuel reachability as fourth execution-overlay physics dimension (after weather / road / daylight).
 */

export type FuelReachabilitySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FuelReachabilitySummary {
  legId: string;
  date: string;

  safeBeforeNextFuel: boolean;

  /** Distance along route corridor to next fuel after this leg (km); Infinity if unknown / none ahead. */
  kmToNextFuel: number;
  /** Remaining drivable range at leg end under effective-range model (km). */
  kmToReachableFuel: number;

  remainingRangeKm: number;

  effectiveRangeKm: number;

  severity: FuelReachabilitySeverity;

  recommendedStopPoiId?: string;
  detourKm?: number;
}

/** Vehicle-side envelope — worst-case multiplier ≥ 1 increases consumption vs nominal. */
export interface VehicleFuelProfile {
  nominalRangeKm: number;
  /** 0–1 reserve kept below nominal (e.g. 0.15 → use 85% of tank range). */
  safetyMarginPct: number;
  /** ≥1 — cold / wind / 4WD composite consumption multiplier. */
  worstCaseMultiplier: number;
}

export interface FuelPoiIndexEntry {
  id: string;
  category: string;
  lat: number;
  lng: number;
  /** Optional distance from route origin along corridor polyline (km), when known. */
  arcKmAlongRoute?: number;
  detourKm?: number;
}

export interface FuelRouteLegInput {
  id: string;
  date: string;
  cumulativeKmToLegEnd: number;
  kmToNextFuel: number;
  distanceKm: number;
}

export interface FuelPolylineInput {
  legs: FuelRouteLegInput[];
}

export interface ComputeFuelReachabilityInput {
  polyline: FuelPolylineInput;
  poiIndex: FuelPoiIndexEntry[];
  vehicleProfile: VehicleFuelProfile;
}
