/**
 * ONT-P2-01 — selected pilot trip gate
 */

import whitelist from './weather-shadow-selected-trips.whitelist.json';

export function getWeatherShadowSelectedTripIds(): string[] {
  return [...whitelist.tripIds];
}

export function isWeatherShadowSelectedTrip(tripId: string): boolean {
  return whitelist.tripIds.includes(tripId);
}

export function assertWeatherShadowSelectedTrip(tripId: string): void {
  if (!isWeatherShadowSelectedTrip(tripId)) {
    throw new Error(
      `ONT-P2-01: trip ${tripId} not in Weather Shadow Pilot selected trips`,
    );
  }
}
