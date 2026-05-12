/**
 * Environment Domain (spec-aligned) — module-local types.
 *
 * NOTE:
 * - The core system already has `EnvironmentState.daylightByDate` and various
 *   env-related scalar fields.
 * - This file defines a "future-proof" typed contract for environment
 *   prediction/time-window snapshots to support verifiable constraints.
 */

export type EnvironmentCondition = 'CLEAR' | 'RAIN' | 'SNOW' | 'STORM' | 'FOG';

export interface WeatherTimeWindow {
  start: string; // ISO datetime
  end: string; // ISO datetime
}

export interface WeatherForecast {
  locationId: string;
  timeWindow: WeatherTimeWindow;

  windSpeedKph: number;
  visibilityMeters: number;
  precipitationMm: number;
  snowDepthCm: number;
  temperatureC: number;

  condition: EnvironmentCondition;
  confidenceScore: number; // 0..1

  source: string;
  updatedAt: string; // ISO datetime
}

export interface Solar {
  locationId: string;

  sunrise: string; // ISO datetime (or ISO-like time string if caller uses that)
  sunset: string; // ISO datetime (or ISO-like time string if caller uses that)

  civilTwilightStart?: string; // optional ISO datetime
  civilTwilightEnd?: string; // optional ISO datetime

  daylightMinutes: number;
}

export interface EnvironmentStateSnapshot {
  locationId: string;
  weatherForecasts: WeatherForecast[];
  solar: Solar;
  generatedAt: string; // ISO datetime
}

