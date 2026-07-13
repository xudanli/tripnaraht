/**
 * Resolve weather slice for road traversability from trip/world evidence (T1).
 */

import { RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY } from '../../../decision-runtime/monitoring/config/iceland-vedur-monitoring.config';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WeatherCondition } from './road-traversability.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapConditionToPrecipitation(
  condition: string | undefined,
): WeatherCondition['precipitation'] {
  const c = String(condition ?? '').toLowerCase();
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'rain';
  if (c.includes('snow') || c.includes('sleet')) return 'snow';
  if (!c || c === 'unknown') return 'unknown';
  return 'none';
}

function readDrillPrecipitation(metadata: Record<string, unknown>): WeatherCondition['precipitation'] | null {
  const drill = asRecord(metadata.roadTraversabilityDrill);
  const precip = drill?.precipitation;
  if (precip === 'rain' || precip === 'snow' || precip === 'none') return precip;
  return null;
}

function readVedurPrecipitation(
  metadata: Record<string, unknown>,
  dayIndex?: number,
): WeatherCondition['precipitation'] | null {
  const state = asRecord(metadata[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY]);
  const byDayRegion = asRecord(state?.byDayRegion);
  if (!byDayRegion) return null;

  const records = Object.entries(byDayRegion).map(([key, raw]) => {
    const record = asRecord(raw);
    const envelope = asRecord(record?.envelope);
    const value = asRecord(envelope?.value);
    const parsedDay = Number(key.split(':')[0]);
    return {
      dayIndex: Number.isFinite(parsedDay) ? parsedDay : undefined,
      condition: typeof value?.condition === 'string' ? value.condition : undefined,
      windSpeedKmh: typeof record?.windSpeedKmh === 'number' ? record.windSpeedKmh : undefined,
      windGustKmh: typeof record?.windGustKmh === 'number' ? record.windGustKmh : undefined,
      observedAt: typeof record?.observedAt === 'string' ? record.observedAt : undefined,
    };
  });

  const scoped =
    dayIndex != null
      ? records.filter((r) => r.dayIndex === dayIndex)
      : records;
  const pick = [...(scoped.length ? scoped : records)].sort((a, b) =>
    String(b.observedAt ?? '').localeCompare(String(a.observedAt ?? '')),
  )[0];
  if (!pick) return null;

  return mapConditionToPrecipitation(pick.condition);
}

function readWorldAssertionWeather(
  assertions: WorldStateAssertion[] | undefined,
): WeatherCondition | null {
  if (!assertions?.length) return null;

  const hazard = [...assertions]
    .reverse()
    .find((a) => a.predicate === 'weather.hazard' && a.status === 'ACTIVE');
  if (!hazard) return null;

  const payload = hazard.payload as {
    windSpeedKmh?: number;
    windGustKmh?: number;
  };
  return {
    precipitation: 'none',
    windSpeedKmh: payload.windSpeedKmh,
    windGustKmh: payload.windGustKmh,
  };
}

export function readWeatherConditionForTraversability(input: {
  tripMetadata: Record<string, unknown>;
  worldAssertions?: WorldStateAssertion[];
  dayIndex?: number;
}): WeatherCondition {
  const drill = readDrillPrecipitation(input.tripMetadata);
  if (drill) {
    const base = readWorldAssertionWeather(input.worldAssertions) ?? {};
    return { ...base, precipitation: drill };
  }

  const vedur = readVedurPrecipitation(input.tripMetadata, input.dayIndex);
  const world = readWorldAssertionWeather(input.worldAssertions);
  if (vedur) {
    return { ...(world ?? {}), precipitation: vedur };
  }
  if (world) return world;

  return { precipitation: 'none' };
}
