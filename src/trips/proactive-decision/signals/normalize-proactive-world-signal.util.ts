/**
 * PD-1 — Normalize Guardian weather/road events → ProactiveWorldSignalV1.
 */

import type { WeatherHazardChangedEvent } from '../../guardian-decision-core/evidence/weather-hazard-changed.event';
import type { RoadStatusChangedEvent } from '../../guardian-decision-core/evidence/road-status-changed.event';
import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';
import type { ProactiveWorldSignalV1 } from '../orchestration/proactive-decision-orchestrator.types';
import { isProactiveV1SignalAllowlisted } from './proactive-trigger-allowlist.util';

export type NormalizeWorldSignalResult =
  | { ok: true; signal: ProactiveWorldSignalV1 }
  | { ok: false; reason: 'SIGNAL_NOT_ALLOWLISTED' | 'UNSUPPORTED_EVENT' };

function weatherSignalKind(
  event: WeatherHazardChangedEvent,
): ProactiveWorldSignalKind {
  const activity = String(event.payload.activityType ?? '').toUpperCase();
  if (
    activity.includes('BLIZZARD') ||
    activity.includes('SNOW') ||
    (event.payload.windGustKmh ?? 0) >= 120
  ) {
    return 'WEATHER_BLIZZARD';
  }
  if (activity.includes('RAIN') || activity.includes('PRECIP')) {
    return 'WEATHER_HEAVY_RAIN';
  }
  return 'WEATHER_WIND';
}

function roadSignalKind(
  event: RoadStatusChangedEvent,
): ProactiveWorldSignalKind | null {
  const status = event.payload.status;
  if (status === 'CLOSED') return 'ROAD_CLOSURE';
  if (status === 'LIMITED') return 'ROAD_DIFFICULTY_CHANGE';
  if (status === 'OPEN' || status === 'UNKNOWN') {
    // Availability change only when leaving a prior non-open state.
    if (
      event.payload.previousStatus &&
      event.payload.previousStatus !== 'OPEN'
    ) {
      return 'ROUTE_AVAILABILITY_CHANGE';
    }
    return null;
  }
  return 'ROUTE_AVAILABILITY_CHANGE';
}

export function normalizeWeatherHazardToProactiveSignal(
  event: WeatherHazardChangedEvent,
): NormalizeWorldSignalResult {
  const kind = weatherSignalKind(event);
  if (!isProactiveV1SignalAllowlisted(kind)) {
    return { ok: false, reason: 'SIGNAL_NOT_ALLOWLISTED' };
  }
  return {
    ok: true,
    signal: {
      schemaId: 'nara.proactive_world_signal@v1',
      version: 1,
      tripId: event.aggregateId,
      signalEventId: event.eventId,
      signalKind: kind,
      countryCode: 'IS',
      observedAt: event.occurredAt,
      evidenceRef: event.payload.evidenceRef,
    },
  };
}

export function normalizeRoadStatusToProactiveSignal(
  event: RoadStatusChangedEvent,
): NormalizeWorldSignalResult {
  const kind = roadSignalKind(event);
  if (!kind || !isProactiveV1SignalAllowlisted(kind)) {
    return { ok: false, reason: 'SIGNAL_NOT_ALLOWLISTED' };
  }
  return {
    ok: true,
    signal: {
      schemaId: 'nara.proactive_world_signal@v1',
      version: 1,
      tripId: event.aggregateId,
      signalEventId: event.eventId,
      signalKind: kind,
      countryCode: 'IS',
      observedAt: event.occurredAt,
      evidenceRef: event.payload.evidenceRef,
    },
  };
}
