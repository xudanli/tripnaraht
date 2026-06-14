/**
 * 将 data-contracts 标准 DTO 包装为 Travel Cognition EvidenceEnvelope。
 */

import type { EvidenceEnvelope, TravelEntityRef } from '../../travel-cognition';
import {
  assessEvidenceFreshness,
  DEFAULT_STRONG_JUDGMENT_TTL_MS,
  type EvidenceFreshnessResult,
} from '../../travel-cognition';
import type { RoadStatus } from '../interfaces/road-status.interface';
import type { WeatherDailyForecast, WeatherData } from '../interfaces/weather.interface';

export function travelEntityRefFromCoordinates(
  lat: number,
  lng: number,
  kind: 'REGION' | 'ROAD' = 'REGION',
): TravelEntityRef {
  const latR = Math.round(lat * 1e4) / 1e4;
  const lngR = Math.round(lng * 1e4) / 1e4;
  return {
    kind,
    id: `coord:${latR},${lngR}`,
    label: `${latR}, ${lngR}`,
  };
}

export function travelEntityRefFromRoadSegment(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): TravelEntityRef {
  const fmt = (p: { lat: number; lng: number }) =>
    `${Math.round(p.lat * 1e4) / 1e4},${Math.round(p.lng * 1e4) / 1e4}`;
  return {
    kind: 'ROAD',
    id: `segment:${fmt(from)}->${fmt(to)}`,
    label: `${fmt(from)} → ${fmt(to)}`,
  };
}

export interface EvidenceEnvelopeWithFreshness<T = unknown> extends EvidenceEnvelope<T> {
  freshness: EvidenceFreshnessResult;
}

function toIso(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

function addMs(isoOrDate: Date | string, ms: number): string {
  const base = isoOrDate instanceof Date ? isoOrDate.getTime() : Date.parse(isoOrDate);
  return new Date(base + ms).toISOString();
}

function computeWeatherConfidence(source: string): number {
  const s = source.toLowerCase();
  if (s.includes('vedur') || s.includes('apis.is') || s.includes('iceland-weather')) {
    return 0.85;
  }
  if (s.includes('open-meteo')) {
    return 0.78;
  }
  if (s.includes('openweather') || s.includes('weatherapi')) {
    return 0.72;
  }
  if (s.includes('default')) {
    return 0.4;
  }
  return 0.65;
}

function computeRoadConfidence(road: RoadStatus): number {
  const meta = road.metadata ?? {};
  const note = typeof meta.note === 'string' ? meta.note : '';
  if (meta.networkError || note.includes('失败') || note.includes('保守')) {
    return 0.35;
  }
  if (road.source === 'default') {
    return 0.45;
  }
  if (road.source === 'road.is') {
    return 0.88;
  }
  return 0.6;
}

export function wrapWeatherDataAsEnvelope(
  weather: WeatherData,
  entityRef: TravelEntityRef,
): EvidenceEnvelope<WeatherData> {
  const observedAt = toIso(weather.lastUpdated);
  return {
    factType: 'WEATHER',
    entityRef,
    value: weather,
    source: weather.source,
    observedAt,
    validUntil: addMs(observedAt, DEFAULT_STRONG_JUDGMENT_TTL_MS.WEATHER),
    confidence: computeWeatherConfidence(weather.source),
  };
}

export function wrapWeatherDailyForecastAsEnvelope(
  forecast: WeatherDailyForecast,
  entityRef: TravelEntityRef,
  observedAt = new Date().toISOString(),
): EvidenceEnvelope<WeatherDailyForecast> {
  return {
    factType: 'WEATHER',
    entityRef,
    value: forecast,
    source: forecast.source,
    observedAt,
    validUntil: `${forecast.date}T23:59:59.999Z`,
    confidence: computeWeatherConfidence(forecast.source),
  };
}

export function wrapRoadStatusAsEnvelope(
  road: RoadStatus,
  entityRef: TravelEntityRef,
): EvidenceEnvelope<RoadStatus> {
  const observedAt = toIso(road.lastUpdated);
  return {
    factType: 'ROAD',
    entityRef,
    value: road,
    source: road.source,
    observedAt,
    validUntil: addMs(observedAt, DEFAULT_STRONG_JUDGMENT_TTL_MS.ROAD),
    confidence: computeRoadConfidence(road),
  };
}

export function withFreshnessAssessment<T>(
  envelope: EvidenceEnvelope<T>,
  nowMs = Date.now(),
): EvidenceEnvelopeWithFreshness<T> {
  return {
    ...envelope,
    freshness: assessEvidenceFreshness(envelope, nowMs),
  };
}
