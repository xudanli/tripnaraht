/**
 * Apply activity / outdoor load environment modifiers to assessment inputs.
 */

import type { ActivityLoadEnvironmentParams } from './environment-modifier.types';

export function applyWindExposureToKmh(
  windKmh: number,
  multiplier: number,
  activityExposed: boolean,
): number {
  if (!activityExposed || multiplier <= 1) return windKmh;
  return Math.round(windKmh * multiplier * 100) / 100;
}

export function applyHighlandFatigueToPhysicalLoad(
  physicalLoad: number,
  fatigueFactor: number,
): number {
  if (fatigueFactor <= 1) return physicalLoad;
  return Math.min(1, Math.round(physicalLoad * fatigueFactor * 1000) / 1000);
}

/** Lower effective daily driving threshold when outdoor fatigue factor applies. */
export function effectiveDailyLoadThresholdHours(
  baseSafeHours: number,
  fatigueFactor: number,
): number {
  if (fatigueFactor <= 1) return baseSafeHours;
  return Math.round((baseSafeHours / fatigueFactor) * 1000) / 1000;
}

export function applyActivityLoadToWeatherFacts(input: {
  windSpeedKmh: number;
  windGustKmh: number;
  activityExposed: boolean;
  activityLoad: ActivityLoadEnvironmentParams;
}): { windSpeedKmh: number; windGustKmh: number } {
  return {
    windSpeedKmh: applyWindExposureToKmh(
      input.windSpeedKmh,
      input.activityLoad.windExposureMultiplier,
      input.activityExposed,
    ),
    windGustKmh: applyWindExposureToKmh(
      input.windGustKmh,
      input.activityLoad.windExposureMultiplier,
      input.activityExposed,
    ),
  };
}
