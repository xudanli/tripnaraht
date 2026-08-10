/**
 * Iceland Fuel P0 — station profiles, policy, and assessment contracts (WP2).
 */

import type { SourceReference } from '../iceland-knowledge.types';
import type { IcelandDriveRunbookAction } from '../runbooks/iceland-drive-runbook.types';

export type IcelandFuelType = 'PETROL' | 'DIESEL';

export type IcelandFuelOpeningMode = 'ALWAYS_OPEN' | 'SCHEDULED' | 'UNKNOWN';

export type IcelandFuelRemoteness = 'URBAN' | 'RURAL' | 'REMOTE';

export type IcelandFuelReliability =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'UNKNOWN';

export type IcelandFuelStationService =
  | 'TOILET'
  | 'FOOD'
  | 'WATER'
  | 'AIR_PUMP'
  | 'REST_AREA';

export interface IcelandFuelStationProfile {
  poiId: string;
  name?: string;
  lat?: number;
  lng?: number;
  fuelTypes: IcelandFuelType[];
  openingMode: IcelandFuelOpeningMode;
  unattended?: boolean;
  paymentSupport?: string[];
  services?: IcelandFuelStationService[];
  remotenessLevel: IcelandFuelRemoteness;
  reliability: IcelandFuelReliability;
  lastVerifiedAt?: string;
  sourceRefs: SourceReference[];
  corridorTags?: string[];
  /** Soft flag for cert / runtime overrides (station temporarily unavailable). */
  unavailable?: boolean;
}

export interface IcelandFuelStationProfileBundle {
  schemaId: 'tripnara.iceland.fuel_station_profiles@v1';
  version: string;
  country: 'IS';
  stations: IcelandFuelStationProfile[];
}

export interface IcelandFuelPolicy {
  schemaId: 'tripnara.iceland.fuel_policy@v1';
  version: string;
  status: 'DRAFT' | 'ACTIVE';
  /** Baseline reserve kept beyond next-station distance (km). */
  baseReserveKm: number;
  remotenessReserveKm: Record<IcelandFuelRemoteness, number>;
  reliabilityReserveKm: Record<IcelandFuelReliability, number>;
  /** Extra reserve when openingMode is UNKNOWN. */
  unknownOpeningReserveKm: number;
  weatherMultipliers: {
    default: number;
    severe: number;
    extreme: number;
  };
  roadMultipliers: {
    default: number;
    degraded: number;
    detour: number;
  };
  /** When station/fuel facts are all unknown — never pretend PASS. */
  allUnknownBlocks: boolean;
  recommendedActions: {
    unknownOpening: 'REFUEL_NOW' | 'ADD_FUEL_STOP';
    primaryUnavailableWithFallback: 'CHANGE_STATION';
    insufficientRange: 'REFUEL_NOW' | 'REPLAN_ROUTE';
    detourExhaustsRange: 'REPLAN_ROUTE';
  };
}

export type FuelAssessmentStatus = 'PASS' | 'WARN' | 'BLOCK';

export type FuelRecommendedAction =
  | 'REFUEL_NOW'
  | 'ADD_FUEL_STOP'
  | 'CHANGE_STATION'
  | 'REPLAN_ROUTE';

export interface FuelAssessment {
  status: FuelAssessmentStatus;
  estimatedRangeKm: number;
  requiredRangeKm: number;
  reserveRangeKm: number;
  nextPrimaryStation?: string;
  fallbackStation?: string;
  assumptions: string[];
  evidence: SourceReference[];
  recommendedAction?: FuelRecommendedAction;
  /** Structured reasons for cert / copilot. */
  reasons: string[];
}

export type FuelWeatherBand = 'default' | 'severe' | 'extreme';
export type FuelRoadBand = 'default' | 'degraded' | 'detour';

export interface IcelandFuelStationAlongRoute {
  profile: IcelandFuelStationProfile;
  /** Distance from current position / leg end to this station (km). */
  distanceKm: number;
}

export interface IcelandFuelAssessmentInput {
  /** Usable remaining range at assessment point (km). */
  estimatedRangeKm: number;
  fuelTypeNeeded: IcelandFuelType;
  /** Planned remaining corridor length if no station match (km). */
  plannedSegmentKm?: number;
  stationsAhead: IcelandFuelStationAlongRoute[];
  weatherBand?: FuelWeatherBand;
  roadBand?: FuelRoadBand;
  /** Extra km from forced detour (raises required range). */
  detourExtraKm?: number;
  /** Corridor-level remoteness override (else inferred from next station). */
  corridorRemoteness?: IcelandFuelRemoteness;
}

export interface IcelandFuelRunbook {
  runbookId: 'IS_RB_FUEL_INSUFFICIENT';
  scenarioType: 'FUEL_INSUFFICIENT';
  version: string;
  trigger: {
    eventTypes: string[];
    conditions: Array<{ field: string; operator: string; value?: string | number | boolean }>;
  };
  preconditions: string[];
  immediateSafetyActions: IcelandDriveRunbookAction[];
  prohibitedActions: IcelandDriveRunbookAction[];
  contextRequired: string[];
  tools: Array<{ toolId: string; purpose: string }>;
  impactAnalysis: {
    affectedEntities: string[];
    temporalPropagation: boolean;
  };
  candidateOperations: Array<
    | 'SHIFT'
    | 'SHORTEN'
    | 'SWAP'
    | 'REROUTE'
    | 'REMOVE'
    | 'ADD_STOP'
    | 'END_DAY_EARLY'
  >;
  confirmationPolicy:
    | 'NO_CONFIRM'
    | 'ACKNOWLEDGE'
    | 'USER_CONFIRM'
    | 'SAFE_STOP_REQUIRED';
  verificationRequired: string[];
  apply: {
    commandType: string;
    createPlanVersion: boolean;
    ledgerRequired: boolean;
  };
  fallback: Array<{ when: string; action: string }>;
  evidence: SourceReference[];
}

export interface IcelandFuelRunbookExecutionInput {
  assessment: FuelAssessment;
  userSafeStopped?: boolean;
}

export interface IcelandFuelRunbookExecutionResult {
  runbookId: 'IS_RB_FUEL_INSUFFICIENT';
  stepsCompleted: string[];
  immediateSafetyActions: string[];
  prohibitedActions: string[];
  candidateOperations: IcelandFuelRunbook['candidateOperations'];
  assessment: FuelAssessment;
  confirmationPolicy: IcelandFuelRunbook['confirmationPolicy'];
  createPlanVersion: boolean;
  ledgerRequired: boolean;
  /** True when post-proposal verification still yields non-BLOCK or confirmed WARN path. */
  verifiedProposal: boolean;
  proposalSummary: string;
}
