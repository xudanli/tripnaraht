/**
 * WP4 — Vehicle × Road fit and Driving Weather Impact contracts.
 */

import type { SourceReference } from '../iceland-knowledge.types';
import type { TemporalImpact } from '../../../../travel-causal-decision/types/temporal-impact.types';

export type IcelandRoadBaseType =
  | 'PAVED'
  | 'GRAVEL'
  | 'F_ROAD'
  | 'FORD'
  | 'WIND_EXPOSED';

export type IcelandRoadLiveStatus =
  | 'OPEN'
  | 'LIMITED'
  | 'CLOSED'
  | 'UNKNOWN';

/** Align with TravelHazard VehicleClass + compact aliases used in product copy. */
export type IcelandVehicleRoadClass =
  | 'SEDAN'
  | 'SUV_2WD'
  | 'SUV_4WD'
  | 'CAMPERVAN'
  | 'EV_CAMPERVAN'
  | 'HIGH_PROFILE';

export type VehicleRoadFitStatus =
  | 'COMPATIBLE'
  | 'CONDITIONAL'
  | 'INCOMPATIBLE'
  | 'UNKNOWN';

export type VehicleRoadFitGate =
  | 'ALLOW'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPLACE'
  | 'REJECT';

export interface VehicleRoadFitAssessment {
  vehicleClass: IcelandVehicleRoadClass;
  roadSegmentId: string;
  roadBaseType: IcelandRoadBaseType;
  roadStatus: IcelandRoadLiveStatus;
  status: VehicleRoadFitStatus;
  gate: VehicleRoadFitGate;
  reasons: string[];
  violatedRules: string[];
  conditionsToProceed: string[];
  evidence: SourceReference[];
  confidence: number;
}

export interface VehicleRoadFitInput {
  vehicleClass: IcelandVehicleRoadClass;
  roadSegmentId: string;
  roadBaseType: IcelandRoadBaseType;
  roadStatus: IcelandRoadLiveStatus;
  /** Rental contract flags, e.g. NO_F_ROAD */
  rentalRestrictions?: string[];
  hasFordCrossing?: boolean;
  windExposure?: 'LOW' | 'MEDIUM' | 'HIGH';
  weatherBand?: 'default' | 'severe' | 'extreme';
  seasonOpen?: boolean;
  driverExperience?: 'NONE' | 'BASIC' | 'EXPERIENCED';
}

export interface IcelandVehicleRoadMatrixCell {
  roadBaseType: IcelandRoadBaseType;
  vehicleClass: IcelandVehicleRoadClass;
  baseStatus: VehicleRoadFitStatus;
  baseGate: VehicleRoadFitGate;
  notes?: string;
}

export interface IcelandVehicleRoadMatrix {
  schemaId: 'tripnara.iceland.vehicle_road_matrix@v1';
  version: string;
  cells: IcelandVehicleRoadMatrixCell[];
}

export type DrivingSpeedImpactLevel = 'NONE' | 'MODERATE' | 'SEVERE';
export type FatigueDelta = 'LOW' | 'MEDIUM' | 'HIGH';
export type VisibilityStatus = 'NORMAL' | 'REDUCED' | 'CRITICAL';
export type RouteSafetyStatus = 'PASS' | 'WARN' | 'BLOCK';

export interface DrivingWeatherCausalStep {
  /** Machine code for UI / Copilot. */
  code: string;
  /** Short human-readable implication (zh). */
  summaryZh: string;
}

export interface DrivingWeatherImpact {
  weatherEventId: string;
  affectedRoadSegments: string[];
  /** Effective phenomenon after gust/visibility/multi resolution. */
  effectivePhenomenon?: DrivingWeatherImpactInput['phenomenon'];
  vehicleModifiers: Array<{
    vehicleClass: IcelandVehicleRoadClass;
    riskMultiplier?: number;
  }>;
  impacts: {
    drivingSpeed?: {
      level: DrivingSpeedImpactLevel;
      /** Inclusive delay range in minutes — never a fake single point. */
      estimatedDelayRangeMin?: [number, number];
    };
    fatigue?: { delta: FatigueDelta };
    visibility?: { status: VisibilityStatus };
    routeSafety?: { status: RouteSafetyStatus };
  };
  /**
   * Ordered causal chain: weather fact → speed → ETA → booking → load → action.
   * Prefer this over a single “有强风” label.
   */
  causalChain: DrivingWeatherCausalStep[];
  temporalImpact: TemporalImpact;
  recommendedActions: string[];
  evidence: SourceReference[];
  confidence: number;
}

export type DrivingWeatherPhenomenon =
  | 'STRONG_WIND'
  | 'GUST'
  | 'SNOW'
  | 'ICE'
  | 'FREEZING_RAIN'
  | 'LOW_VISIBILITY'
  | 'HEAVY_RAIN'
  | 'DUST_ASH'
  | 'EXTREME_COLD'
  | 'MULTI';

export interface DrivingWeatherImpactInput {
  weatherEventId: string;
  phenomenon: DrivingWeatherPhenomenon;
  /** Secondary phenomena stacked with primary (triggers MULTI merge when non-empty). */
  additionalPhenomena?: DrivingWeatherPhenomenon[];
  windGustMs?: number;
  visibilityM?: number;
  affectedRoadSegments: string[];
  vehicleClass: IcelandVehicleRoadClass;
  roadExposure?: 'LOW' | 'MEDIUM' | 'HIGH';
  driverExperience?: 'NONE' | 'BASIC' | 'EXPERIENCED';
  segmentLengthKm?: number;
  isNight?: boolean;
  detectedAt?: string;
}

export type CrossDomainAggregateStatus =
  | 'ALLOW'
  | 'NEED_CONFIRM'
  | 'REPLAN_REQUIRED'
  | 'BLOCK';

export interface CrossDomainAggregateInput {
  vehicleRoadFit?: VehicleRoadFitAssessment;
  weatherImpact?: DrivingWeatherImpact;
  fuelStatus?: 'PASS' | 'WARN' | 'BLOCK';
  fuelReliabilityUnknown?: boolean;
  daylightLoad?: DaylightDrivingLoadAssessment;
  winter?: import('../winter/iceland-winter-knowledge.types').IcelandWinterKnowledgeAssessments;
}

export interface CrossDomainAggregateResult {
  status: CrossDomainAggregateStatus;
  reasons: string[];
  recommendedActions: string[];
  evidence: SourceReference[];
}

export type RegulationSeverity = 'BLOCK' | 'MUST_CONFIRM' | 'WARN' | 'INFO';

export interface RegulationNormItem {
  topicId: string;
  severity: RegulationSeverity;
  summary: string;
  authorityRefs: SourceReference[];
}

export interface DaylightDrivingPolicy {
  schemaId: 'tripnara.iceland.daylight_driving_policy@v1';
  version: string;
  status?: string;
  /**
   * Strategy thresholds only — civil dawn/dusk minutes come from SunCalc at runtime.
   * Never invent dusk/dawn from this file.
   */
  nightExposureWarnMinutes: number;
  winterBufferMinutes: number;
  /** Same-day drive minutes that count as elevated load (e.g. 240 = 4h). */
  dailyDriveLoadWarnMinutes?: number;
  unfamiliarNightWeatherStack: {
    nightMinutes: number;
    weatherBand: 'severe' | 'extreme';
    aggregate: 'NEED_CONFIRM' | 'REPLAN_REQUIRED';
  };
  fullLoadStack?: {
    nightMinutes: number;
    sameDayDriveMinutes: number;
    requireNextMorningBooking: boolean;
    aggregate: 'NEED_CONFIRM' | 'REPLAN_REQUIRED';
    actions: string[];
  };
  /** Minutes from local midnight; default lodging latest arrival when not provided. */
  latestArrivalDefaultLocalMin?: number;
  winterBufferFactor?: number;
  latestDepartureDerivation: string;
}

export interface DaylightDrivingLoadInput {
  /** driveMinutesAfterCivilDusk (or equivalent structured night exposure). */
  nightExposureMinutes: number;
  /** Accumulated same-day drive minutes (structured). */
  sameDayDriveMinutes?: number;
  /** Next morning has a fixed booking / activity start. */
  nextMorningBooking?: boolean;
  /** Road / corridor is unfamiliar (default true when night exposure > 0). */
  unfamiliarRoad?: boolean;
  weatherBand?: 'default' | 'severe' | 'extreme';
  /** Lodging latest arrival — minutes from local midnight (e.g. 21:00 → 1260). */
  latestArrivalHotelLocalMin?: number;
  /** Remaining drive minutes to lodging (structured). */
  remainingDriveMinutes?: number;
  /**
   * Optional SunCalc-derived window (minutes from local midnight).
   * When absent, suggestedDrivingWindow is omitted — never invented.
   */
  civilDawnLocalMin?: number;
  civilDuskLocalMin?: number;
}

export interface DaylightDrivingLoadAssessment {
  nightExposureMinutes: number;
  sameDayDriveMinutes: number;
  winterBufferMinutes: number;
  suggestedDrivingWindow?: {
    startLocalMin: number;
    endLocalMin: number;
  };
  latestDepartureLocalMin?: number;
  latestArrivalLodgingLocalMin: number;
  gate: CrossDomainAggregateStatus;
  reasons: string[];
  recommendedActions: string[];
  stack: {
    nightWarn: boolean;
    heavyDayLoad: boolean;
    nextMorningBooking: boolean;
    unfamiliarNightWeather: boolean;
    fullLoadStack: boolean;
  };
  evidence: SourceReference[];
  confidence: number;
}
