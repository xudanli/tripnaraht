/**
 * Anti-noise gates for live Vedur weather observation ingest.
 */

import { VEDUR_WEATHER_PROHIBITED_WIND_KMH } from '../../../decision-runtime/monitoring/config/iceland-vedur-monitoring.config';

export type WeatherRiskTier = 'CALM' | 'ELEVATED' | 'PROHIBITED';

export interface WeatherObservationSnapshot {
  windSpeedKmh: number;
  windGustKmh?: number;
  riskTier: WeatherRiskTier;
  fingerprint: string;
  observedAt: string;
  validUntil?: string;
}

export interface WeatherObservationChangeInput {
  previous?: WeatherObservationSnapshot | null;
  next: WeatherObservationSnapshot;
  windDeltaKmh?: number;
  nowMs?: number;
  stagingProhibitedWindKmh?: number;
}

export function effectiveWindKmh(windSpeedKmh: number, windGustKmh?: number): number {
  return Math.max(windSpeedKmh, windGustKmh ?? 0);
}

export function classifyWeatherRiskTier(
  windSpeedKmh: number,
  windGustKmh?: number,
  prohibitedThresholdKmh = VEDUR_WEATHER_PROHIBITED_WIND_KMH,
): WeatherRiskTier {
  const effective = effectiveWindKmh(windSpeedKmh, windGustKmh);
  if (effective >= prohibitedThresholdKmh) return 'PROHIBITED';
  if (effective >= prohibitedThresholdKmh * 0.7) return 'ELEVATED';
  return 'CALM';
}

export function buildWeatherObservationFingerprint(input: {
  source: string;
  windSpeedKmh: number;
  windGustKmh?: number;
  observedAt: string;
  stationId?: string;
}): string {
  const gust = input.windGustKmh ?? 0;
  const station = input.stationId ?? 'unknown';
  return `${input.source}|${station}|w${input.windSpeedKmh}|g${gust}`;
}

function isAssertionExpired(validUntil: string | undefined, nowMs: number): boolean {
  if (!validUntil) return false;
  const ts = Date.parse(validUntil);
  return Number.isFinite(ts) && ts < nowMs;
}

export function shouldEmitWeatherObservationChange(input: WeatherObservationChangeInput): boolean {
  const prev = input.previous;
  const next = input.next;
  const nowMs = input.nowMs ?? Date.now();
  const deltaThreshold = input.windDeltaKmh ?? 5;

  if (!prev) {
    return next.riskTier !== 'CALM';
  }
  if (prev.fingerprint === next.fingerprint) {
    return false;
  }
  if (prev.riskTier !== next.riskTier) {
    return true;
  }
  const windDelta = Math.abs(
    effectiveWindKmh(next.windSpeedKmh, next.windGustKmh) -
      effectiveWindKmh(prev.windSpeedKmh, prev.windGustKmh),
  );
  if (windDelta >= deltaThreshold) {
    return true;
  }
  if (isAssertionExpired(prev.validUntil, nowMs)) {
    return next.riskTier !== 'CALM';
  }
  return false;
}
