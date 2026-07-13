/**
 * Road traversability contracts — ADR-ROAD-TRAVERSABILITY-MODEL § Type Contracts.
 */

import type { RoadSegmentProfile } from '../../../decision-runtime/packs/road/road-segment-profile.types';

export type RoadSegmentStatus = 'OPEN' | 'LIMITED' | 'CLOSED' | 'UNKNOWN';

export type RoadSurfaceCondition =
  | 'NORMAL'
  | 'WET'
  | 'SLIPPERY'
  | 'ICY'
  | 'SNOW_COVERED'
  | 'HEAVY_SNOW'
  | 'LOOSE_GRAVEL'
  | 'FLOODED'
  | 'IMPASSABLE'
  | 'UNKNOWN';

export interface RoadSegmentCondition {
  status: RoadSegmentStatus;
  condition: RoadSurfaceCondition;
  observedAt: string;
  validUntil?: string;
  sourceProvider: string;
}

export type VehicleDriveType = '2WD' | 'AWD' | '4WD';

export type VehicleClass =
  | 'SMALL_CAR'
  | 'SUV'
  | 'LARGE_4X4'
  | 'CAMPERVAN'
  | 'MOTORHOME'
  | 'COMPACT';

export interface VehicleCapability {
  driveType: VehicleDriveType;
  vehicleClass: VehicleClass | string;
  groundClearanceMm?: number;
  riverCrossingAllowed: boolean;
  rentalRestrictions?: string[];
}

export interface DriverCapability {
  gravelRoadExperience?: boolean;
  snowDrivingExperience?: boolean;
  acceptsRiverCrossing?: boolean;
  acceptsNightDriving?: boolean;
  maxDailyDrivingHours?: number;
}

export interface TripExecutionContext {
  tripId: string;
  destination: string;
  hasElderlyOrChildren?: boolean;
  isMotorhome?: boolean;
  highWindExposure?: boolean;
  timeWindow?: { lastEntryAt?: string; closesAt?: string };
}

/** Minimal weather slice for road×surface interaction (T1). */
export interface WeatherCondition {
  precipitation?: 'none' | 'rain' | 'snow' | 'unknown';
  windSpeedKmh?: number;
  windGustKmh?: number;
}

export interface RoadTraversabilityInput {
  roadProfile: RoadSegmentProfile;
  liveCondition: RoadSegmentCondition;
  weather: WeatherCondition;
  vehicle: VehicleCapability;
  driverProfile: DriverCapability;
  tripContext: TripExecutionContext;
}

export type TraversabilityResult =
  | 'PASSABLE'
  | 'PASSABLE_WITH_CAUTION'
  | 'VEHICLE_INCOMPATIBLE'
  | 'DRIVER_INCOMPATIBLE'
  | 'TEMPORARILY_IMPASSABLE'
  | 'CLOSED'
  | 'UNKNOWN';

export type TraversabilityGate =
  | 'ALLOW'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'REJECT';

export interface RoadTraversabilityAssessment {
  result: TraversabilityResult;
  expectedSpeedKph?: number;
  addedDurationMinutes?: number;
  hardConstraints: string[];
  risks: string[];
  evidenceRefs: string[];
  gate: TraversabilityGate;
}

export const ROAD_TRAVERSABILITY_CONSTRAINTS = {
  ROAD_CLOSED: 'ROAD_CLOSED',
  ROAD_DATA_GAP: 'ROAD_DATA_GAP',
  F_ROAD_REQUIRES_4WD: 'F_ROAD_REQUIRES_4WD',
  VEHICLE_CLASS_INSUFFICIENT: 'VEHICLE_CLASS_INSUFFICIENT',
  RIVER_CROSSING_NOT_ALLOWED: 'RIVER_CROSSING_NOT_ALLOWED',
  RIVER_CROSSING_WEATHER_RISK: 'RIVER_CROSSING_WEATHER_RISK',
  GRAVEL_EXPERIENCE_REQUIRED: 'GRAVEL_EXPERIENCE_REQUIRED',
  SURFACE_IMPASSABLE: 'SURFACE_IMPASSABLE',
} as const;
