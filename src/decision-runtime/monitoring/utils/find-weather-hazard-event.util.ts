/**
 * Resolve WEATHER_HAZARD_CHANGED events from RFC-001 world store for monitoring replay.
 */

import type { StoredRfc001WorldState } from '../../../trips/guardian-decision-core/evidence/world-state-store.service';
import {
  WEATHER_HAZARD_CHANGED_EVENT,
  WEATHER_HIGH_WIND_THRESHOLD_KMH,
  type WeatherHazardChangedEvent,
  type WeatherHazardChangedPayload,
} from '../../../trips/guardian-decision-core/evidence/weather-hazard-changed.event';
import type { WorldStateAssertion } from '../../../trips/guardian-decision-core/contracts/world-state.types';
import type { WeatherHazardAssertionPayload } from '../../../trips/guardian-decision-core/adapters/weather-hazard-to-assertion.adapter';
import {
  findOpenRoadProblemId as findOpenProblemIdForEvent,
  findRoadProblemIdForEvent as findProblemIdForTriggerEvent,
} from './find-road-status-event.util';

export { findOpenProblemIdForEvent, findProblemIdForTriggerEvent };

export function findLatestWeatherHazardEvent(
  store: StoredRfc001WorldState,
  tripId: string,
  dayIndex?: number,
): WeatherHazardChangedEvent | undefined {
  const matches = store.events
    .filter((event): event is WeatherHazardChangedEvent => {
      if (event.eventType !== WEATHER_HAZARD_CHANGED_EVENT) return false;
      if (event.aggregateId !== tripId) return false;
      const payload = event.payload as WeatherHazardChangedPayload;
      if (dayIndex != null && payload.dayIndex !== dayIndex) return false;
      return weatherPayloadImpliesHazard(payload);
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return matches[0];
}

export function weatherAssertionImpliesHazard(assertion: WorldStateAssertion): boolean {
  if (assertion.predicate !== 'weather.hazard' || assertion.status !== 'ACTIVE') {
    return false;
  }
  return weatherPayloadImpliesHazard(assertion.payload as WeatherHazardAssertionPayload);
}

export function dayIndexFromWeatherAssertion(assertion: WorldStateAssertion): number | undefined {
  const payload = assertion.payload as WeatherHazardAssertionPayload;
  return payload.dayIndex;
}

function weatherPayloadImpliesHazard(payload: {
  windSpeedKmh?: number;
  windGustKmh?: number;
  requiresGuide?: boolean;
}): boolean {
  const effective = Math.max(payload.windSpeedKmh ?? 0, payload.windGustKmh ?? 0);
  return effective >= WEATHER_HIGH_WIND_THRESHOLD_KMH || payload.requiresGuide === true;
}

export function findExistingWeatherProblemId(
  problems: Array<{ problemId: string; status: string; semanticCapability?: string }>,
  _dayIndex: number,
): string | undefined {
  const matches = problems.filter(
    (p) =>
      p.status === 'OPEN' &&
      (p.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED' ||
        p.problemId.startsWith('problem_weather_')),
  );
  return matches[matches.length - 1]?.problemId;
}
