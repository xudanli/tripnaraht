/**
 * VERIFY 前补全 opening_hours_evidence：覆盖行程内全部 numeric place_id，并与 Place DB 对齐。
 */

import type { Itinerary, ItineraryItem } from '../interfaces/trip-plan.interface';
import {
  extractOpeningHoursFromPlaceMetadata,
  hasResolvableOpeningHours,
  normalizePoiIdKey,
} from '../../common/utils/resolve-place-opening-hours.util';

export type ResolvedItineraryItemOpeningHours = {
  opening_hours: unknown;
  source: 'item_metadata' | 'opening_hours_evidence' | 'poi_evidence';
  is_open_now?: boolean;
};

const DEFAULT_MAX_POI_IDS = 48;

export function collectNumericPlaceIdsFromItinerary(
  itinerary: Itinerary | undefined,
  max = DEFAULT_MAX_POI_IDS,
): string[] {
  const ids = new Set<string>();
  for (const day of itinerary?.days ?? []) {
    for (const item of day.items ?? []) {
      const t = String(item.type ?? 'POI').toUpperCase();
      if (t !== 'POI' && t !== 'ACTIVITY' && t !== 'VIEWPOINT' && t !== 'NATURE') continue;
      const key = normalizePoiIdKey(item.location_ref?.place_id);
      if (key) ids.add(key);
    }
    if (ids.size >= max) break;
  }
  return [...ids].slice(0, max);
}

export function collectPlaceIdsFromResearchPois(researchData: Record<string, unknown> | undefined): string[] {
  const ids = new Set<string>();
  const ev = researchData?.poi_evidence;
  const pools: unknown[] = [];
  if (Array.isArray(ev)) pools.push(...ev);
  else if (ev && typeof ev === 'object') {
    const o = ev as Record<string, unknown>;
    if (Array.isArray(o.pois)) pools.push(...o.pois);
  }
  if (Array.isArray(researchData?.pois)) pools.push(...researchData.pois);

  for (const row of pools) {
    const p = row as Record<string, unknown>;
    const key = normalizePoiIdKey(p.poi_id ?? p.id ?? p.place_id);
    if (key) ids.add(key);
  }
  return [...ids];
}

export function mergeOpeningHoursEvidenceLists(
  existing: unknown,
  fetched: Array<{ poi_id?: string; opening_hours?: unknown }>,
): Array<Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();

  const ingest = (row: unknown) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const key = normalizePoiIdKey(r.poi_id);
    if (!key) return;
    byId.set(key, r);
  };

  if (Array.isArray(existing)) {
    existing.forEach(ingest);
  } else if (existing && typeof existing === 'object') {
    const arr = (existing as { opening_hours?: unknown[] }).opening_hours;
    if (Array.isArray(arr)) arr.forEach(ingest);
  }

  for (const row of fetched) {
    const key = normalizePoiIdKey(row.poi_id);
    if (!key) continue;
    const prior = byId.get(key);
    const mergedHours = row.opening_hours ?? prior?.opening_hours;
    if (!hasResolvableOpeningHours(mergedHours) && !hasResolvableOpeningHours(prior?.opening_hours)) {
      continue;
    }
    byId.set(key, {
      ...(prior ?? {}),
      ...row,
      poi_id: key,
      opening_hours: mergedHours ?? prior?.opening_hours,
    });
  }

  return [...byId.values()];
}

export function buildOpeningHoursEvidenceIndex(
  openingHoursData: unknown,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  const ingest = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const key = normalizePoiIdKey(row.poi_id);
    if (!key) return;
    map.set(key, row);
  };

  if (Array.isArray(openingHoursData)) {
    openingHoursData.forEach(ingest);
  } else if (openingHoursData && typeof openingHoursData === 'object') {
    const arr = (openingHoursData as { opening_hours?: unknown[] }).opening_hours;
    if (Array.isArray(arr)) arr.forEach(ingest);
  }
  return map;
}

/** 遍历 research_data 中 POI 池（poi_evidence / pois） */
export function iterPoiEvidenceRows(
  researchData: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const ev = researchData?.poi_evidence;
  if (Array.isArray(ev)) rows.push(...(ev as Array<Record<string, unknown>>));
  else if (ev && typeof ev === 'object') {
    const pois = (ev as { pois?: unknown[] }).pois;
    if (Array.isArray(pois)) rows.push(...(pois as Array<Record<string, unknown>>));
  }
  if (Array.isArray(researchData?.pois)) {
    rows.push(...(researchData.pois as Array<Record<string, unknown>>));
  }
  return rows;
}

export function lookupOpeningHoursFromPoiEvidence(
  researchData: Record<string, unknown> | undefined,
  poiId: string,
): unknown | undefined {
  for (const p of iterPoiEvidenceRows(researchData)) {
    const key = normalizePoiIdKey(p.poi_id ?? p.id ?? p.place_id);
    if (key !== poiId) continue;
    const direct = p.opening_hours ?? p.openingHours;
    if (hasResolvableOpeningHours(direct)) return direct;
    const meta = extractOpeningHoursFromPlaceMetadata(p.metadata ?? p);
    if (hasResolvableOpeningHours(meta)) return meta;
  }
  return undefined;
}

/**
 * 统一解析行程项营业时间：metadata → opening_hours_evidence → poi_evidence。
 * UI 时间轴上的 start/end 是计划访问窗，不等同于本函数返回值。
 */
export function resolveItineraryItemOpeningHours(
  item: Pick<ItineraryItem, 'location_ref' | 'metadata'>,
  researchData?: Record<string, unknown>,
): ResolvedItineraryItemOpeningHours | undefined {
  if (hasResolvableOpeningHours(item.metadata?.opening_hours)) {
    return { opening_hours: item.metadata!.opening_hours, source: 'item_metadata' };
  }

  const poiId = normalizePoiIdKey(item.location_ref?.place_id);
  if (!poiId || !researchData) return undefined;

  const evidenceIndex = buildOpeningHoursEvidenceIndex(researchData.opening_hours_evidence);
  const row = evidenceIndex.get(poiId);
  if (row && hasResolvableOpeningHours(row.opening_hours)) {
    return {
      opening_hours: row.opening_hours,
      source: 'opening_hours_evidence',
      is_open_now:
        typeof row.is_open_now === 'boolean' ? row.is_open_now : undefined,
    };
  }

  const fromPoi = lookupOpeningHoursFromPoiEvidence(researchData, poiId);
  if (hasResolvableOpeningHours(fromPoi)) {
    return { opening_hours: fromPoi, source: 'poi_evidence' };
  }

  return undefined;
}

export function collectOpeningHoursPoiIdsForHydration(
  itinerary: Itinerary | undefined,
  researchData: Record<string, unknown> | undefined,
  max = DEFAULT_MAX_POI_IDS,
): string[] {
  const ids = new Set<string>();
  for (const id of collectNumericPlaceIdsFromItinerary(itinerary, max)) ids.add(id);
  for (const id of collectPlaceIdsFromResearchPois(researchData)) {
    ids.add(id);
    if (ids.size >= max) break;
  }
  return [...ids].slice(0, max);
}

export async function hydrateOpeningHoursEvidenceForItinerary(params: {
  itinerary: Itinerary | undefined;
  researchData: Record<string, unknown>;
  openingHoursSkill: { execute: (input: { poi_ids: string[] }) => Promise<{ opening_hours?: unknown[] }> };
  maxPoiIds?: number;
}): Promise<{ fetched: number; merged: number }> {
  const poiIds = collectOpeningHoursPoiIdsForHydration(
    params.itinerary,
    params.researchData,
    params.maxPoiIds ?? DEFAULT_MAX_POI_IDS,
  );
  if (!poiIds.length) return { fetched: 0, merged: 0 };

  const existingIndex = buildOpeningHoursEvidenceIndex(params.researchData.opening_hours_evidence);
  const missing = poiIds.filter((id) => {
    const row = existingIndex.get(id);
    return !row || !hasResolvableOpeningHours(row.opening_hours);
  });
  if (!missing.length) {
    return { fetched: 0, merged: existingIndex.size };
  }

  const result = await params.openingHoursSkill.execute({ poi_ids: missing });
  const fetched = Array.isArray(result.opening_hours) ? result.opening_hours : [];
  const merged = mergeOpeningHoursEvidenceLists(params.researchData.opening_hours_evidence, fetched);
  params.researchData.opening_hours_evidence = merged;
  return { fetched: fetched.length, merged: merged.length };
}
