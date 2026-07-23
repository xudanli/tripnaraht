/**
 * ONT-P2-01 — read-only adapter: world view → offline case shape (no Fact writes)
 */

import type { WeatherOfflineAccuracyCase } from '../weather-shadow/weather-forecast-series.types';
import type { WeatherShadowWorldView } from './weather-shadow-pilot.types';

export function worldViewToOfflineCase(
  view: WeatherShadowWorldView,
): WeatherOfflineAccuracyCase {
  const affectedScopes = [
    ...view.routeSegmentIds,
    ...(view.vehicleClass ? [view.vehicleClass] : []),
  ];
  return {
    caseId: `live_${view.tripId}_${view.regionId}_${view.asOf}`,
    tripId: view.tripId,
    regionId: view.regionId,
    subjectId: view.subjectId,
    affectedScopes,
    asOf: view.asOf,
    horizonEndAt: view.horizonEndAt,
    forecastSeries: view.forecastSeries.map((f) => ({
      at: f.at,
      predictedLevel: f.predictedLevel,
      forecastIssuedAt: f.forecastIssuedAt,
    })),
    actualSeries: view.weatherFactSeries.map((w) => ({
      at: w.at,
      actualLevel: w.level,
    })),
  };
}

/** Observe context revision without mutating it */
export function observeContextRevision(view: WeatherShadowWorldView): number {
  return view.contextRevision;
}
