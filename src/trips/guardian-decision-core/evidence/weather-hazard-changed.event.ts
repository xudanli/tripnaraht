/**
 * RFC-002 Slice 2 — WEATHER_HAZARD_CHANGED trigger event.
 */

import type { TravelDecisionEvent } from './travel-decision-event.types';

export const WEATHER_HAZARD_CHANGED_EVENT = 'WEATHER_HAZARD_CHANGED' as const;

export type WeatherHazardSourceProvider =
  | 'iceland_met'
  | 'global_weather'
  | 'admin_injection';

export interface WeatherHazardChangedPayload {
  dayIndex?: number;
  regionId?: string;
  windSpeedKmh: number;
  windGustKmh?: number;
  activityType?: string;
  requiresGuide?: boolean;
  sourceProvider: WeatherHazardSourceProvider;
  evidenceRef?: string;
}

export type WeatherHazardChangedEvent =
  TravelDecisionEvent<WeatherHazardChangedPayload>;

export interface BuildWeatherHazardChangedEventInput {
  tripId: string;
  windSpeedKmh: number;
  dayIndex?: number;
  regionId?: string;
  windGustKmh?: number;
  activityType?: string;
  requiresGuide?: boolean;
  sourceProvider?: WeatherHazardSourceProvider;
  correlationId?: string;
  occurredAt?: string;
}

export function buildWeatherHazardChangedEvent(
  input: BuildWeatherHazardChangedEventInput,
): WeatherHazardChangedEvent {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const region = input.regionId ?? 'IS_DEFAULT';
  const correlationId =
    input.correlationId ?? `corr_${input.tripId}_weather_${region}`;
  return {
    eventId: `evt_weather_${input.tripId}_${region}_${Date.now()}`,
    eventType: WEATHER_HAZARD_CHANGED_EVENT,
    aggregateType: 'TRIP',
    aggregateId: input.tripId,
    occurredAt,
    correlationId,
    ontologyVersion: 'rfc001-0.1.0',
    payload: {
      dayIndex: input.dayIndex,
      regionId: region,
      windSpeedKmh: input.windSpeedKmh,
      windGustKmh: input.windGustKmh,
      activityType: input.activityType,
      requiresGuide: input.requiresGuide,
      sourceProvider: input.sourceProvider ?? 'admin_injection',
    },
  };
}

/** Wind speed above this threshold implies hazardous outdoor activity (km/h). */
export const WEATHER_HIGH_WIND_THRESHOLD_KMH = 90;

export function weatherHazardImpliesProhibition(
  payload: WeatherHazardChangedPayload,
): boolean {
  const effective = Math.max(
    payload.windSpeedKmh,
    payload.windGustKmh ?? 0,
  );
  return effective >= WEATHER_HIGH_WIND_THRESHOLD_KMH;
}
