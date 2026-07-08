/**
 * Slice 2 — WEATHER_HAZARD_CHANGED → WorldStateAssertion.
 */

import type { EntityRef } from '../contracts/entity-ref.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WorldStateAssertionSource } from '../contracts/world-state.types';
import {
  RFC001_EVIDENCE_RESOLVER_VERSION,
  RFC001_WEATHER_ASSERTION_VALIDITY_MS,
} from '../config/rfc001-iceland.config';
import type {
  WeatherHazardChangedPayload,
  WeatherHazardSourceProvider,
} from '../evidence/weather-hazard-changed.event';

export interface WeatherHazardAssertionPayload {
  dayIndex?: number;
  regionId: string;
  windSpeedKmh: number;
  windGustKmh?: number;
  activityType?: string;
  requiresGuide?: boolean;
}

export interface WeatherHazardToAssertionInput {
  tripId: string;
  payload: WeatherHazardChangedPayload;
  evidenceRef: string;
  observedAt: string;
  confidence: number;
  assertionId?: string;
}

function resolveSubjectRef(tripId: string, regionId: string): EntityRef {
  return {
    kind: 'REGION',
    id: regionId,
    label: `weather:${regionId}:trip:${tripId}`,
  };
}

function mapProviderToSourceType(
  provider: WeatherHazardSourceProvider,
): WorldStateAssertionSource['sourceType'] {
  if (provider === 'admin_injection') return 'INTERNAL';
  if (provider === 'global_weather') return 'PARTNER';
  return 'OFFICIAL';
}

export function buildEvidenceRefForWeather(
  tripId: string,
  regionId: string,
  observedAt: string,
): string {
  const bucket = observedAt.slice(0, 13);
  return `ev_weather_${regionId.toLowerCase()}_${tripId.slice(0, 8)}_${bucket}`;
}

export function weatherHazardChangedToAssertion(
  input: WeatherHazardToAssertionInput,
): WorldStateAssertion<WeatherHazardAssertionPayload> {
  const regionId = input.payload.regionId ?? 'IS_DEFAULT';
  const assertionId =
    input.assertionId ??
    `wsa_weather_${input.tripId}_${regionId}_${Date.now()}`;
  const validUntil = new Date(
    new Date(input.observedAt).getTime() + RFC001_WEATHER_ASSERTION_VALIDITY_MS,
  ).toISOString();

  return {
    assertionId,
    subjectRef: resolveSubjectRef(input.tripId, regionId),
    predicate: 'weather.hazard',
    payload: {
      dayIndex: input.payload.dayIndex,
      regionId,
      windSpeedKmh: input.payload.windSpeedKmh,
      windGustKmh: input.payload.windGustKmh,
      activityType: input.payload.activityType,
      requiresGuide: input.payload.requiresGuide,
    },
    source: {
      provider: input.payload.sourceProvider,
      sourceType: mapProviderToSourceType(input.payload.sourceProvider),
      evidenceRefs: [input.evidenceRef],
    },
    observedAt: input.observedAt,
    validFrom: input.observedAt,
    validUntil,
    confidence: input.confidence,
    status: 'ACTIVE',
    version: 1,
  };
}

export function assertionImpliesWeatherProhibition(
  assertion: WorldStateAssertion<WeatherHazardAssertionPayload>,
): boolean {
  const effective = Math.max(
    assertion.payload.windSpeedKmh,
    assertion.payload.windGustKmh ?? 0,
  );
  return effective >= 90;
}

/** @internal resolver version trace */
export const WEATHER_ASSERTION_ADAPTER_VERSION = RFC001_EVIDENCE_RESOLVER_VERSION;
