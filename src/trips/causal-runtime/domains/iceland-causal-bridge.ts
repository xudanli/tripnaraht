/**
 * Bridge Iceland causal module ↔ travel-time ontology ↔ What-If intervention layer.
 */

import type { TravelTimeEstimateV1 } from '../../decision/travel-time-ontology/travel-time-ontology.types';
import type { WhatIfCausalProjection } from '../what-if-intervention.types';
import {
  runIcelandSelfDriveCausalAnalysis,
  windToSpeedFactor,
} from './iceland-self-drive-causal.engine';
import type {
  IcelandSelfDriveCausalInput,
  IcelandSelfDriveCausalOutput,
  IcelandWindExposure,
} from './iceland-self-drive-causal.types';

export function mapIcelandRegionToWindExposure(region?: string): IcelandWindExposure {
  const r = (region ?? '').toLowerCase();
  if (['vik', 'hofn', 'keflavik', 'isafjordur', 'south', 'south_coast'].some((k) => r.includes(k))) {
    return 'high';
  }
  if (['highlands', 'east', 'egilsstadir'].some((k) => r.includes(k))) {
    return 'medium';
  }
  return 'low';
}

export function buildIcelandInputFromTravelLeg(input: {
  routeLabel: string;
  distanceKm: number;
  timeEstimate?: TravelTimeEstimateV1;
  durationMinutes?: number;
  windMps: number;
  appointmentSlackMinutes: number;
  shiftMinutes?: number;
  region?: string;
  vehicleClass?: IcelandSelfDriveCausalInput['vehicleClass'];
}): IcelandSelfDriveCausalInput {
  const baseDurationMinutes =
    input.timeEstimate?.pointEstimateMinutes ??
    input.durationMinutes ??
    Math.max(30, Math.round((input.distanceKm / 55) * 60));

  return {
    routeLabel: input.routeLabel,
    distanceKm: input.distanceKm,
    baseDurationMinutes,
    windMps: input.windMps,
    windExposure: mapIcelandRegionToWindExposure(input.region),
    appointmentSlackMinutes: input.appointmentSlackMinutes,
    shiftMinutes: input.shiftMinutes,
    region: input.region,
    vehicleClass: input.vehicleClass,
  };
}

export function mergeIcelandCausalIntoProjection(
  iceland: IcelandSelfDriveCausalOutput,
  base?: WhatIfCausalProjection,
): WhatIfCausalProjection {
  return {
    causalChain: iceland.causalChain,
    bindings: iceland.bindings.map((b) => ({
      variable: b.variable,
      label: b.label,
      baseValue: b.baseValue,
      projectedValue: b.projectedValue,
      unit: b.unit,
    })),
    primaryDriver: base?.primaryDriver ?? 'MISS',
  };
}

export function analyzeIcelandSelfDriveLeg(
  input: Parameters<typeof buildIcelandInputFromTravelLeg>[0],
  calibration?: Pick<
    import('./iceland-causal-calibration.types').IcelandCausalCalibration,
    'windFactorAdjust' | 'missLogisticAdjust'
  >,
): IcelandSelfDriveCausalOutput {
  return runIcelandSelfDriveCausalAnalysis(buildIcelandInputFromTravelLeg(input), calibration);
}

/** Counterfactual: re-run with shift minutes from What-If SHIFT_EARLIER action. */
export function analyzeIcelandWithShift(
  base: IcelandSelfDriveCausalInput,
  shiftMinutes: number,
): IcelandSelfDriveCausalOutput {
  return runIcelandSelfDriveCausalAnalysis({ ...base, shiftMinutes });
}

export function enrichTravelEstimateWithWindP90(input: {
  estimate: TravelTimeEstimateV1;
  windMps: number;
  windExposure?: IcelandWindExposure;
}): TravelTimeEstimateV1 {
  const factor = windToSpeedFactor(input.windMps, input.windExposure ?? 'medium');
  const point = Math.max(5, Math.round(input.estimate.pointEstimateMinutes / factor));
  const spread = Math.min(0.38, 0.12 + input.windMps / 45);
  return {
    ...input.estimate,
    pointEstimateMinutes: point,
    p10Minutes: Math.round(point * (1 - spread * 0.35)),
    p90Minutes: Math.round(point * (1 + spread)),
    factors: {
      ...input.estimate.factors,
      weatherDelayMultiplier: (input.estimate.factors.weatherDelayMultiplier ?? 1) / factor,
    },
    inputsResolved: {
      ...input.estimate.inputsResolved,
      weatherBucket: input.windMps >= 14 ? 'adverse' : 'clear',
    },
  };
}
