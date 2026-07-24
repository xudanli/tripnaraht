/**
 * Reconstruct Resolve*Result from persisted world state (no second EvidenceResolver).
 */

import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../../../trips/guardian-decision-core/config/rfc001-iceland.config';
import type { WorldStateAssertion } from '../../../trips/guardian-decision-core/contracts/world-state.types';
import type { WeatherHazardAssertionPayload } from '../../../trips/guardian-decision-core/adapters/weather-hazard-to-assertion.adapter';
import type { RoadStatusAssertionPayload } from '../../../trips/guardian-decision-core/adapters/road-status-to-assertion.adapter';
import {
  WEATHER_HAZARD_CHANGED_EVENT,
  type WeatherHazardChangedEvent,
} from '../../../trips/guardian-decision-core/evidence/weather-hazard-changed.event';
import {
  ROAD_STATUS_CHANGED_EVENT,
  type RoadStatusChangedEvent,
} from '../../../trips/guardian-decision-core/evidence/road-status-changed.event';
import type { StoredRfc001WorldState } from '../../../trips/guardian-decision-core/evidence/world-state-store.service';
import type {
  ResolveRoadStatusChangedResult,
  ResolveWeatherHazardChangedResult,
} from '../../../trips/guardian-decision-core/evidence/evidence-resolver.service';
import { assertionImpliesHardClosure } from '../../../trips/guardian-decision-core/adapters/road-status-to-assertion.adapter';
import { assertionImpliesWeatherProhibition } from '../../../trips/guardian-decision-core/adapters/weather-hazard-to-assertion.adapter';

export function findAssertionById(
  store: StoredRfc001WorldState,
  assertionId: string,
): WorldStateAssertion | undefined {
  return store.assertions.find((a) => a.assertionId === assertionId);
}

export function findEventById(
  store: StoredRfc001WorldState,
  eventId: string,
): WeatherHazardChangedEvent | RoadStatusChangedEvent | undefined {
  return store.events.find((e) => e.eventId === eventId) as
    | WeatherHazardChangedEvent
    | RoadStatusChangedEvent
    | undefined;
}

export function findLatestSnapshotForAssertion(
  store: StoredRfc001WorldState,
  assertionId: string,
) {
  const matches = store.snapshots.filter((s) => s.assertionIds.includes(assertionId));
  return matches.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
}

export function buildWeatherResolvedFromStore(
  store: StoredRfc001WorldState,
  tripId: string,
  assertionId: string,
  eventId?: string,
): ResolveWeatherHazardChangedResult | undefined {
  const assertion = findAssertionById(store, assertionId) as
    | WorldStateAssertion<WeatherHazardAssertionPayload>
    | undefined;
  if (!assertion || assertion.predicate !== 'weather.hazard') return undefined;

  const event = (eventId
    ? findEventById(store, eventId)
    : [...store.events]
        .reverse()
        .find(
          (e) =>
            e.eventType === WEATHER_HAZARD_CHANGED_EVENT && e.aggregateId === tripId,
        )) as WeatherHazardChangedEvent | undefined;

  if (!event || event.eventType !== WEATHER_HAZARD_CHANGED_EVENT) return undefined;

  const snapshot = findLatestSnapshotForAssertion(store, assertionId);
  if (!snapshot) return undefined;

  return {
    event,
    assertion,
    snapshot,
    resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
    weatherProhibition: assertionImpliesWeatherProhibition(assertion),
    supersededAssertionIds: [],
  };
}

export function buildRoadResolvedFromStore(
  store: StoredRfc001WorldState,
  _tripId: string,
  assertionId: string,
  eventId?: string,
): ResolveRoadStatusChangedResult | undefined {
  const assertion = findAssertionById(store, assertionId) as
    | WorldStateAssertion<RoadStatusAssertionPayload>
    | undefined;
  if (!assertion || assertion.predicate !== 'road.status') return undefined;

  const event = (eventId
    ? findEventById(store, eventId)
    : [...store.events]
        .reverse()
        .find((e) => e.eventType === ROAD_STATUS_CHANGED_EVENT)) as
    | RoadStatusChangedEvent
    | undefined;

  if (!event || event.eventType !== ROAD_STATUS_CHANGED_EVENT) return undefined;

  const snapshot = findLatestSnapshotForAssertion(store, assertionId);
  if (!snapshot) return undefined;

  return {
    event,
    assertion,
    snapshot,
    resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
    hardClosure: assertionImpliesHardClosure(assertion),
    supersededAssertionIds: [],
  };
}

export function weatherPayloadImpliesHazardPromotion(
  payload: WeatherHazardAssertionPayload,
): boolean {
  const effective = Math.max(payload.windSpeedKmh ?? 0, payload.windGustKmh ?? 0);
  return effective >= 90 || payload.requiresGuide === true;
}

export function roadPayloadImpliesHazardPromotion(
  payload: RoadStatusAssertionPayload,
): boolean {
  return payload.status === 'CLOSED' || payload.status === 'LIMITED';
}

export function roadPayloadImpliesRecovery(payload: RoadStatusAssertionPayload): boolean {
  return payload.status === 'OPEN';
}
