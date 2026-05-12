/**
 * Inputs for route execution hazard projection (geometry stays shallow — adapters fill details).
 */

import type { VehicleProfile } from '../../decision/hazard/travel-hazard.types';

export interface RouteGeometryRef {
  /** Ordered vertex sequence along the driven corridor. */
  coordinates?: ReadonlyArray<{ lat: number; lng: number }>;
}

export interface ElevationProfileSample {
  distanceM: number;
  elevationM: number;
  gradePct?: number;
}

export interface RouteElevationProfile {
  samples: ElevationProfileSample[];
}

export interface WeatherAlongRouteSample {
  /** Position along route 0..1 */
  alongRatio: number;
  crosswindRisk?: number;
  snowExposure?: number;
  whiteoutProbability?: number;
}

export interface WeatherAlongRouteGrid {
  samples?: ReadonlyArray<WeatherAlongRouteSample>;
}

export interface RoadConditionAlongRoute {
  /** Corridor-level hints merged from road constraint graph / official status. */
  fRoad?: boolean;
  requires4WD?: boolean;
  seasonalClosureRisk?: number;
}

export interface RouteExecutionWindow {
  startIso: string;
  endIso: string;
}

export interface ProjectRouteExecutionHazardsInput {
  legId: string;
  geometry: RouteGeometryRef;
  elevationProfile: RouteElevationProfile;
  weatherGrid: WeatherAlongRouteGrid;
  roadCondition: RoadConditionAlongRoute;
  vehicleProfile: VehicleProfile;
  timeWindow: RouteExecutionWindow;
  /** Nominal drive time without corridor penalties (minutes). */
  baselineDurationMin?: number;
  /** Override segment count (otherwise derived from geometry). */
  segmentCount?: number;
}
