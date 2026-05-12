import type { Solar, WeatherForecast } from './environment-domain.types';
import { sha256Signature } from '../../../agent/contracts/decision-contract.types';

function parseIsoTimeMillis(iso: string): number | null {
  if (typeof iso !== 'string') return null;
  const t = new Date(iso);
  const ms = t.getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function getWeatherForTime(params: {
  weatherForecasts: WeatherForecast[];
  timeISO: string;
}): WeatherForecast | null {
  const { weatherForecasts, timeISO } = params;
  if (!Array.isArray(weatherForecasts) || !weatherForecasts.length) return null;
  const t = parseIsoTimeMillis(timeISO);
  if (t == null) return null;

  // Choose the first forecast whose window contains the time.
  // If none match, fall back to the closest-by-start forecast.
  for (const f of weatherForecasts) {
    const s = parseIsoTimeMillis(f.timeWindow.start);
    const e = parseIsoTimeMillis(f.timeWindow.end);
    if (s == null || e == null) continue;
    if (t >= s && t < e) return f;
  }

  let best: { f: WeatherForecast; dist: number } | null = null;
  for (const f of weatherForecasts) {
    const s = parseIsoTimeMillis(f.timeWindow.start);
    if (s == null) continue;
    const dist = Math.abs(t - s);
    if (!best || dist < best.dist) best = { f, dist };
  }
  return best?.f ?? null;
}

export function calculateEnvironmentHash(input: {
  windSpeedKph?: number | null;
  visibilityMeters?: number | null;
  snowDepthCm?: number | null;
  sunsetISO?: string | null;
}): string {
  const windSpeedKph = typeof input.windSpeedKph === 'number' && Number.isFinite(input.windSpeedKph) ? input.windSpeedKph : null;
  const visibilityMeters =
    typeof input.visibilityMeters === 'number' && Number.isFinite(input.visibilityMeters) ? input.visibilityMeters : null;
  const snowDepthCm = typeof input.snowDepthCm === 'number' && Number.isFinite(input.snowDepthCm) ? input.snowDepthCm : null;

  const sunsetISO = typeof input.sunsetISO === 'string' && input.sunsetISO.trim() ? input.sunsetISO.trim() : null;

  // "environmentHash = hash(windSpeed, visibility, snowDepth, sunset)" (spec)
  return sha256Signature({
    windSpeedKph,
    visibilityMeters,
    snowDepthCm,
    sunsetISO,
  });
}

export function calculateEnvironmentRisk(params: {
  windSpeedKph?: number | null;
  visibilityMeters?: number | null;
  precipitationMm?: number | null;
  snowDepthCm?: number | null;
  solar?: Solar | null;
  eventTimeISO?: string | null;
  policy: {
    wind_drive_limit_kph: number;
    min_visibility_m: number;
    snow_depth_limit_cm: number;
    precipitation_limit_mm: number;
    sunset_safety_buffer_min: number;
  };
}): number {
  const p = params.policy;
  const windFactor =
    typeof params.windSpeedKph === 'number' && Number.isFinite(params.windSpeedKph)
      ? Math.min(1, Math.max(0, params.windSpeedKph / Math.max(0.0001, p.wind_drive_limit_kph)))
      : 0;

  const visibilityFactor =
    typeof params.visibilityMeters === 'number' && Number.isFinite(params.visibilityMeters)
      ? Math.min(1, Math.max(0, p.min_visibility_m / Math.max(0.0001, params.visibilityMeters)))
      : 0;

  const precipitationFactor =
    typeof params.precipitationMm === 'number' && Number.isFinite(params.precipitationMm)
      ? Math.min(1, Math.max(0, params.precipitationMm / Math.max(0.0001, p.precipitation_limit_mm)))
      : 0;

  const snowDepthFactor =
    typeof params.snowDepthCm === 'number' && Number.isFinite(params.snowDepthCm)
      ? Math.min(1, Math.max(0, params.snowDepthCm / Math.max(0.0001, p.snow_depth_limit_cm)))
      : 0;

  let daylightFactor = 0;
  if (params.solar && params.eventTimeISO) {
    const eventMs = parseIsoTimeMillis(params.eventTimeISO);
    const sunsetMs = parseIsoTimeMillis(params.solar.sunset);
    if (eventMs != null && sunsetMs != null) {
      // If scheduled time is too close to (or after) sunset - buffer -> risk increases.
      const deadlineMs = sunsetMs - p.sunset_safety_buffer_min * 60_000;
      daylightFactor = eventMs > deadlineMs ? Math.min(1, (eventMs - deadlineMs) / 60_000) : 0; // 1 when >~60 min late
    }
  }

  const raw = windFactor + visibilityFactor + precipitationFactor + snowDepthFactor + daylightFactor;
  return Math.min(1, Math.max(0, raw / 5)); // normalized into 0..1
}

