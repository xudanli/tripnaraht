import {
  DEFAULT_ENVIRONMENT_RISK_POLICY,
  DEFAULT_SEGMENT_FACT_CONFIDENCE,
  METADATA_KEY_ENVIRONMENT_OVERRIDES_V1,
  METADATA_KEY_SEGMENT_FACTS_V1,
  ROUTE_DIRECTION_ADMIN_METADATA_SOURCE,
  type EnvironmentOverridesMergeMode,
  type SegmentFactsMergeMode,
} from '../contracts/admin-metadata.v1';
import { calculateEnvironmentRisk } from '../../trips/ontology/environment/environment-domain.util';
import type { SegmentFactV1Dto } from '../dto/segment-facts-v1.dto';
import type { EnvironmentOverridesV1Dto } from '../dto/environment-overrides-v1.dto';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMergeRecords(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeRecords(
        out[k] as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

function segmentKey(fact: { roadId?: string; fromPoiId?: string; toPoiId?: string }): string {
  return [
    String(fact.roadId ?? '').trim(),
    String(fact.fromPoiId ?? '').trim(),
    String(fact.toPoiId ?? '').trim(),
  ].join('|');
}

export function normalizeSegmentFact(
  fact: SegmentFactV1Dto | Record<string, unknown>,
): Record<string, unknown> {
  const f = fact as Record<string, unknown>;
  const roadId = String(f.roadId ?? '').trim();
  return {
    ...f,
    roadId,
    confidence:
      typeof f.confidence === 'number' && Number.isFinite(f.confidence)
        ? f.confidence
        : DEFAULT_SEGMENT_FACT_CONFIDENCE,
    source:
      typeof f.source === 'string' && f.source.trim()
        ? f.source
        : ROUTE_DIRECTION_ADMIN_METADATA_SOURCE,
    updatedAt:
      typeof f.updatedAt === 'string' && f.updatedAt.trim()
        ? f.updatedAt
        : new Date().toISOString(),
  };
}

export function mergeSegmentFactsV1(
  existing: unknown,
  incoming: SegmentFactV1Dto[],
  mode: SegmentFactsMergeMode = 'replace',
): Record<string, unknown>[] {
  const normalizedIncoming = incoming
    .map((f) => normalizeSegmentFact(f))
    .filter((f) => String(f.roadId ?? '').trim());

  if (mode === 'replace') return normalizedIncoming;

  const prev = Array.isArray(existing)
    ? (existing as Record<string, unknown>[]).map((f) =>
        normalizeSegmentFact(f as any),
      )
    : [];
  const map = new Map<string, Record<string, unknown>>();
  for (const f of prev) map.set(segmentKey(f as any), f);
  for (const f of normalizedIncoming) map.set(segmentKey(f as any), f);
  return [...map.values()];
}

export function mergeEnvironmentOverridesV1(
  existing: unknown,
  incoming: EnvironmentOverridesV1Dto | Record<string, unknown>,
  mode: EnvironmentOverridesMergeMode = 'merge',
): Record<string, unknown> {
  const patch = { ...(incoming as Record<string, unknown>) };
  if (!patch.source) patch.source = ROUTE_DIRECTION_ADMIN_METADATA_SOURCE;
  if (!patch.at) patch.at = new Date().toISOString();

  if (mode === 'replace' || !isPlainObject(existing)) {
    return patch;
  }
  return deepMergeRecords(existing, patch);
}

/**
 * Deep-merge admin metadata keys so opaque PUT/PATCH does not drop sibling keys
 * and environment_overrides nests merge safely.
 */
export function mergeAdminMetadataKeys(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const prev = existing ?? {};
  const next = incoming ?? {};
  const merged: Record<string, unknown> = { ...prev, ...next };

  if (next[METADATA_KEY_SEGMENT_FACTS_V1] !== undefined) {
    merged[METADATA_KEY_SEGMENT_FACTS_V1] = mergeSegmentFactsV1(
      prev[METADATA_KEY_SEGMENT_FACTS_V1],
      Array.isArray(next[METADATA_KEY_SEGMENT_FACTS_V1])
        ? (next[METADATA_KEY_SEGMENT_FACTS_V1] as SegmentFactV1Dto[])
        : [],
      'replace',
    );
  }

  if (next[METADATA_KEY_ENVIRONMENT_OVERRIDES_V1] !== undefined) {
    merged[METADATA_KEY_ENVIRONMENT_OVERRIDES_V1] = mergeEnvironmentOverridesV1(
      prev[METADATA_KEY_ENVIRONMENT_OVERRIDES_V1],
      next[METADATA_KEY_ENVIRONMENT_OVERRIDES_V1] as EnvironmentOverridesV1Dto,
      'merge',
    );
  }

  return merged;
}

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function selectForecastSlice(
  weather: Record<string, unknown> | undefined,
  eventTimeISO?: string,
): Record<string, unknown> {
  if (!weather) return {};
  const series = Array.isArray(weather.forecastSeries)
    ? weather.forecastSeries
    : Array.isArray(weather.forecast_series)
      ? weather.forecast_series
      : [];
  if (!series.length || !eventTimeISO) return weather;
  const t = Date.parse(eventTimeISO);
  if (!Number.isFinite(t)) return weather;
  const hit = series.find((x: any) => {
    const start = Date.parse(String(x?.start ?? x?.timeWindow?.start ?? ''));
    const end = Date.parse(String(x?.end ?? x?.timeWindow?.end ?? ''));
    return Number.isFinite(start) && Number.isFinite(end) && t >= start && t <= end;
  });
  return hit && typeof hit === 'object' ? (hit as Record<string, unknown>) : weather;
}

/**
 * Server-side weather risk preview (same policy as research-pipeline defaults).
 */
export function previewEnvironmentRisk(input: {
  weather?: Record<string, unknown>;
  solar?: Record<string, unknown>;
  eventTimeISO?: string;
}): {
  weatherRisk: number;
  policy: {
    wind_drive_limit_kph: number;
    min_visibility_m: number;
    precipitation_limit_mm: number;
    snow_depth_limit_cm: number;
    sunset_safety_buffer_min: number;
  };
  eventTimeISO: string | null;
  selectedWeather: Record<string, unknown>;
} {
  const eventTimeISO = input.eventTimeISO?.trim() || null;
  const selected = selectForecastSlice(input.weather, eventTimeISO ?? undefined);

  const windMps = pickNumber(selected.wind_mps, selected.windMps);
  const windSpeedKph =
    pickNumber(selected.windSpeedKph, selected.wind_speed_kph) ??
    (windMps != null ? windMps * 3.6 : null);

  const twilight =
    pickNumber(
      input.solar?.twilightBufferMin,
      input.solar?.twilight_buffer_min,
    ) ?? DEFAULT_ENVIRONMENT_RISK_POLICY.sunset_safety_buffer_min;

  const dateKey = eventTimeISO?.slice(0, 10);
  const daylight =
    dateKey && isPlainObject(input.solar?.daylightByDate)
      ? (input.solar!.daylightByDate as Record<string, any>)[dateKey]
      : null;
  const sunsetISO =
    (daylight && typeof daylight.sunset === 'string' && daylight.sunset) ||
    (dateKey &&
      isPlainObject(input.solar?.sunsetByDate) &&
      typeof (input.solar!.sunsetByDate as any)[dateKey] === 'string' &&
      (input.solar!.sunsetByDate as any)[dateKey]) ||
    null;

  const policy = {
    ...DEFAULT_ENVIRONMENT_RISK_POLICY,
    sunset_safety_buffer_min: twilight,
  };

  const weatherRisk = calculateEnvironmentRisk({
    windSpeedKph,
    visibilityMeters: pickNumber(
      selected.visibilityMeters,
      selected.visibility_m,
      selected.visibility_meters,
    ),
    precipitationMm: pickNumber(
      selected.precipitationMm,
      selected.precipitation_mm,
    ),
    snowDepthCm: pickNumber(selected.snowDepthCm, selected.snow_depth_cm),
    solar: sunsetISO
      ? {
          locationId: 'preview',
          sunrise: '',
          sunset: sunsetISO,
          daylightMinutes: 0,
        }
      : null,
    eventTimeISO,
    policy,
  });

  return {
    weatherRisk,
    policy,
    eventTimeISO,
    selectedWeather: selected,
  };
}
