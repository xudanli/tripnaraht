/**
 * Iceland self-drive causal domain — weather → road speed → ETA distribution → appointment miss.
 */

export const ICELAND_SELF_DRIVE_CAUSAL_SCHEMA = 'tripnara/iceland-self-drive-causal/v1' as const;

export type IcelandWindExposure = 'low' | 'medium' | 'high';

export interface IcelandSelfDriveCausalInput {
  schema?: typeof ICELAND_SELF_DRIVE_CAUSAL_SCHEMA;
  /** Route label for narrative, e.g. "Vík → 冰川徒步集合点" */
  routeLabel: string;
  /** Segment distance (km) */
  distanceKm: number;
  /** Baseline driving duration without wind stress (minutes) */
  baseDurationMinutes: number;
  /** 10m wind speed (m/s) during travel window */
  windMps: number;
  windGustMps?: number;
  /** Coast / fjord exposure heuristic */
  windExposure?: IcelandWindExposure;
  /** Minutes of slack before hard appointment / last entry */
  appointmentSlackMinutes: number;
  /** Optional shift intervention (negative = depart earlier) */
  shiftMinutes?: number;
  region?: string;
  vehicleClass?: '2WD' | '4WD' | 'AWD' | 'unknown';
  drivingExperience?: 'none' | 'some' | 'experienced';
}

export interface IcelandTravelTimeDistribution {
  pointMinutes: number;
  p10Minutes: number;
  p90Minutes: number;
  effectiveSpeedKmh: number;
  windSpeedFactor: number;
}

export interface IcelandSelfDriveCausalOutput {
  schema: typeof ICELAND_SELF_DRIVE_CAUSAL_SCHEMA;
  input: IcelandSelfDriveCausalInput;
  travelTime: IcelandTravelTimeDistribution;
  missProbability: number;
  missProbabilityAfterShift?: number;
  causalChain: string[];
  /** Structured bindings aligned with WhatIfCausalProjection */
  bindings: Array<{
    variable: string;
    label: string;
    baseValue?: number;
    projectedValue?: number;
    unit?: string;
  }>;
  /** Primary user-visible sentence (zh) */
  userFacingAssessment: string;
  recommendedIntervention?: {
    type: 'SHIFT_TIME';
    shiftMinutes: number;
    rationale: string;
  };
}
