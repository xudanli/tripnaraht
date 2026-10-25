/**
 * Shared fact builders for Policy Lab CONFLICT_MATRIX evaluation.
 * Used by GATE_EVAL and decision-runtime Constraint Gateway.
 */

import { getWeatherForTime } from '../../trips/ontology/environment/environment-domain.util';

export type PolicyLabVehicleType = '2WD' | '4WD' | string | undefined;

export interface PolicyLabPhysicalWorldInput {
  roadStates?: unknown[];
  prefetchedEvidence?: unknown[];
  vehicleType?: PolicyLabVehicleType;
  /** ISO time used to pick forecast series point */
  timeISO?: string;
}

export function pickRelevantForecastWeather(
  weatherRaw: unknown,
  timeISO?: string,
): Record<string, unknown> | unknown {
  if (!weatherRaw || typeof weatherRaw !== 'object') return weatherRaw;
  const wr = weatherRaw as Record<string, unknown>;
  const series = Array.isArray(wr.forecastSeries)
    ? wr.forecastSeries
    : Array.isArray(wr.forecast_series)
      ? wr.forecast_series
      : [];
  if (series.length === 0) return weatherRaw;
  const resolvedTime = timeISO ?? new Date().toISOString();

  const normalizedSeries = series
    .filter((x: unknown) => x && typeof x === 'object')
    .map((x: any) => ({
      locationId: String(x.locationId ?? x.location_id ?? ''),
      timeWindow: {
        start: String(x.start ?? x.timeWindow?.start ?? x.time_window?.start ?? ''),
        end: String(x.end ?? x.timeWindow?.end ?? x.time_window?.end ?? ''),
      },
      windSpeedKph:
        typeof x.windSpeedKph === 'number'
          ? x.windSpeedKph
          : typeof x.wind_speed_kph === 'number'
            ? x.wind_speed_kph
            : typeof x.wind_mps === 'number'
              ? x.wind_mps * 3.6
              : NaN,
      visibilityMeters:
        typeof x.visibilityMeters === 'number'
          ? x.visibilityMeters
          : typeof x.visibility_m === 'number'
            ? x.visibility_m
            : typeof x.visibility_meters === 'number'
              ? x.visibility_meters
              : NaN,
      precipitationMm:
        typeof x.precipitationMm === 'number'
          ? x.precipitationMm
          : typeof x.precipitation_mm === 'number'
            ? x.precipitation_mm
            : NaN,
      snowDepthCm:
        typeof x.snowDepthCm === 'number'
          ? x.snowDepthCm
          : typeof x.snow_depth_cm === 'number'
            ? x.snow_depth_cm
            : NaN,
      temperatureC: typeof x.temperatureC === 'number' ? x.temperatureC : NaN,
      condition: String(x.condition ?? 'CLEAR'),
      confidenceScore:
        typeof x.confidenceScore === 'number'
          ? x.confidenceScore
          : typeof x.confidence_score === 'number'
            ? x.confidence_score
            : 0,
      source: String(x.source ?? ''),
      updatedAt: String(x.updatedAt ?? x.updated_at ?? ''),
    }))
    .filter((x) => x.timeWindow.start && x.timeWindow.end);

  const selected = getWeatherForTime({
    weatherForecasts: normalizedSeries as any,
    timeISO: String(resolvedTime),
  }) as any;
  return selected ?? weatherRaw;
}

export function resolveVehicleClass(vehicleType: PolicyLabVehicleType): string {
  if (vehicleType === '2WD') return 'SMALL_CAR';
  if (vehicleType === '4WD') return 'SUV_4WD';
  return 'UNKNOWN';
}

export function hasFRoadSegment(roadStates: unknown[]): boolean {
  return (Array.isArray(roadStates) ? roadStates : []).some((r: any) => {
    const md = r?.metadata ?? {};
    const t = String(md?.segmentType ?? '').toUpperCase();
    const s = String(md?.surfaceType ?? '').toLowerCase();
    return t === 'F_ROAD' || s === 'f-road';
  });
}

export function findEnvironmentOverride(prefetchedEvidence: unknown[]): any | undefined {
  const list = Array.isArray(prefetchedEvidence) ? prefetchedEvidence : [];
  return list.find(
    (x) => x && typeof x === 'object' && (x as any).kind === 'environment_overrides_v1',
  );
}

/**
 * Build CONFLICT_MATRIX facts from physical world inputs (parity with GATE_EVAL).
 */
export function buildFactsFromPhysicalWorld(
  input: PolicyLabPhysicalWorldInput,
): Record<string, unknown> {
  const roadStates = Array.isArray(input.roadStates) ? input.roadStates : [];
  const prefetched = Array.isArray(input.prefetchedEvidence) ? input.prefetchedEvidence : [];
  const envOverride = findEnvironmentOverride(prefetched);
  const weather = pickRelevantForecastWeather(envOverride?.overrides?.weather, input.timeISO) as any;

  const visibilityMeters =
    typeof weather?.visibility_m === 'number'
      ? Number(weather.visibility_m)
      : typeof weather?.visibilityMeters === 'number'
        ? Number(weather.visibilityMeters)
        : typeof weather?.visibility_meters === 'number'
          ? Number(weather.visibility_meters)
          : null;
  const precipitationMm =
    typeof weather?.precipitation_mm === 'number'
      ? Number(weather.precipitation_mm)
      : typeof weather?.precipitationMm === 'number'
        ? Number(weather.precipitationMm)
        : null;
  const confidenceScore =
    typeof weather?.confidenceScore === 'number'
      ? Number(weather.confidenceScore)
      : typeof weather?.confidence_score === 'number'
        ? Number(weather.confidence_score)
        : null;
  const windKph =
    typeof weather?.windSpeedKph === 'number'
      ? Number(weather.windSpeedKph)
      : typeof weather?.wind_speed_kph === 'number'
        ? Number(weather.wind_speed_kph)
        : typeof weather?.wind_mps === 'number'
          ? Number(weather.wind_mps) * 3.6
          : null;
  const snowDepthCm =
    typeof weather?.snowDepthCm === 'number'
      ? Number(weather.snowDepthCm)
      : typeof weather?.snow_depth_cm === 'number'
        ? Number(weather.snow_depth_cm)
        : typeof weather?.snow_depth_cm_value === 'number'
          ? Number(weather.snow_depth_cm_value)
          : null;

  return {
    segment: { type: hasFRoadSegment(roadStates) ? 'F_ROAD' : 'OTHER' },
    weather: {
      visibilityMeters,
      precipitationMm,
      confidenceScore,
      windSpeedKph: windKph,
      snowDepthCm,
    },
    vehicle: { type: resolveVehicleClass(input.vehicleType) },
  };
}

/** Extract physical inputs from agent researchData shape. */
export function extractPhysicalFromResearchData(
  researchData: Record<string, any> | undefined,
  tripRequest?: { constraints?: { vehicle_type?: string }; date_range?: { start_date?: string }; start_date?: string },
): PolicyLabPhysicalWorldInput {
  const rd = researchData ?? {};
  const prefetched: unknown[] =
    (rd?.world?.physical?.prefetched_evidence as unknown[]) ??
    (rd?.world_build_context?.world?.physical?.prefetched_evidence as unknown[]) ??
    (rd?.worldModel?.physical?.prefetched_evidence as unknown[]) ??
    [];
  const roadStates: unknown[] =
    (rd?.world?.physical?.roadStates as unknown[]) ??
    (rd?.world_build_context?.world?.physical?.roadStates as unknown[]) ??
    (rd?.worldModel?.physical?.roadStates as unknown[]) ??
    [];
  const vehicleType = (tripRequest as any)?.constraints?.vehicle_type as string | undefined;
  const timeISO =
    (tripRequest as any)?.date_range?.start_date ??
    (tripRequest as any)?.start_date ??
    undefined;
  return {
    roadStates: Array.isArray(roadStates) ? roadStates : [],
    prefetchedEvidence: Array.isArray(prefetched) ? prefetched : [],
    vehicleType,
    timeISO,
  };
}

/** Extract physical inputs from decision-runtime EvaluatePlanInput-like shapes. */
export function extractPhysicalFromWorldState(input: {
  worldState?: any;
  plan?: any;
  vehicleType?: string;
  timeISO?: string;
}): PolicyLabPhysicalWorldInput {
  const physical = input.worldState?.physical ?? {};
  const roadStates = Array.isArray(physical.roadStates) ? physical.roadStates : [];
  const prefetched = Array.isArray(physical.prefetched_evidence)
    ? physical.prefetched_evidence
    : Array.isArray(physical.prefetchedEvidence)
      ? physical.prefetchedEvidence
      : [];
  const vehicleType =
    input.vehicleType ??
    input.worldState?.policies?.vehicleClass ??
    input.worldState?.context?.vehicleType ??
    input.plan?.constraints?.vehicle_type ??
    input.plan?.metadata?.vehicle_type;
  const timeISO =
    input.timeISO ??
    input.worldState?.context?.startDate ??
    input.plan?.days?.[0]?.date;
  return {
    roadStates,
    prefetchedEvidence: prefetched,
    vehicleType,
    timeISO,
  };
}
