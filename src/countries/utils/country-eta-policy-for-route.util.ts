import type { DrivingSide, RoadSurfaceForEta } from '../types/country-profile-v2.types';
import { computeRouteEtaModifier } from './country-driving-policy.util';
import {
  defaultRoadConditionForCountry,
  inferRoadSurfacesFromCondition,
  type RoadConditionHints,
} from './infer-road-surfaces.util';

export interface CountryEtaPolicyInput {
  complianceInfo: unknown;
  userHabitDrivingSide?: DrivingSide;
  roadSurfaces: RoadSurfaceForEta[];
  /** Leg-level multiplier applied to baseline drive minutes */
  baselineEtaModifier: number;
}

export function buildCountryEtaPolicyInput(
  complianceInfo: unknown,
  roadCondition: RoadConditionHints,
  options?: { userHabitDrivingSide?: DrivingSide; countryCode?: string },
): CountryEtaPolicyInput {
  const merged =
    options?.countryCode != null
      ? defaultRoadConditionForCountry(options.countryCode, roadCondition)
      : roadCondition;
  const roadSurfaces = inferRoadSurfacesFromCondition(merged);
  const baselineEtaModifier = computeRouteEtaModifier({
    complianceInfo,
    roadSurfaces,
    userHabitDrivingSide: options?.userHabitDrivingSide ?? 'RIGHT',
  });
  return {
    complianceInfo,
    userHabitDrivingSide: options?.userHabitDrivingSide ?? 'RIGHT',
    roadSurfaces,
    baselineEtaModifier,
  };
}
