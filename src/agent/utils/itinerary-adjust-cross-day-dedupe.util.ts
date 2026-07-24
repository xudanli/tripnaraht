/**
 * ITINERARY_ADJUST：目标日改排时排除已在其它日历日出现的 POI（跨天去重）。
 */

import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { TripDayAnchorRow } from './itinerary-adjust-neighbor-anchors.util';

const SKIP_ITEM_TYPES = new Set(['DRIVE', 'TRANSIT', 'WALK', 'REST']);

export type OccupiedPoiKeySet = {
  placeIds: Set<string>;
  names: Set<string>;
};

function normalizePlaceId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return s.toLowerCase();
}

function normalizePoiName(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function poiOccupancyKeysFromRow(row: {
  place_id?: unknown;
  poi_id?: unknown;
  id?: unknown;
  name?: unknown;
  nameCN?: unknown;
  nameEN?: unknown;
}): { placeId?: string; name?: string } {
  const placeId = normalizePlaceId(row.place_id ?? row.poi_id ?? row.id);
  const name = normalizePoiName(row.name ?? row.nameCN ?? row.nameEN);
  return {
    ...(placeId ? { placeId } : {}),
    ...(name ? { name } : {}),
  };
}

export function collectOccupiedPoiKeysFromTripDayRows(
  dayRows: TripDayAnchorRow[],
  excludeDateIso: string,
): OccupiedPoiKeySet {
  const exclude = excludeDateIso.slice(0, 10);
  const placeIds = new Set<string>();
  const names = new Set<string>();

  for (const day of dayRows) {
    if (day.dateIso.slice(0, 10) === exclude) continue;
    for (const item of day.items) {
      const pid = normalizePlaceId(item.placeId);
      if (pid) placeIds.add(pid);
      const name = normalizePoiName(item.name);
      if (name) names.add(name);
    }
  }

  return { placeIds, names };
}

export function collectOccupiedPoiKeysFromItineraryDays(
  itinerary: Itinerary | undefined,
  excludeDateIso: string,
): OccupiedPoiKeySet {
  const placeIds = new Set<string>();
  const names = new Set<string>();
  const exclude = excludeDateIso.slice(0, 10);

  for (const day of itinerary?.days ?? []) {
    if (String(day.date ?? '').slice(0, 10) === exclude) continue;
    for (const item of day.items ?? []) {
      const t = String(item.type ?? 'POI').toUpperCase();
      if (SKIP_ITEM_TYPES.has(t)) continue;
      const pid = normalizePlaceId(item.location_ref?.place_id);
      if (pid) placeIds.add(pid);
      const name = normalizePoiName(item.location_ref?.name);
      if (name) names.add(name);
    }
  }

  return { placeIds, names };
}

export function mergeOccupiedPoiKeySets(...sets: OccupiedPoiKeySet[]): OccupiedPoiKeySet {
  const placeIds = new Set<string>();
  const names = new Set<string>();
  for (const s of sets) {
    s.placeIds.forEach((id) => placeIds.add(id));
    s.names.forEach((n) => names.add(n));
  }
  return { placeIds, names };
}

export function isPoiOccupiedOnOtherDays(
  poi: Record<string, unknown>,
  occupied: OccupiedPoiKeySet,
): boolean {
  const keys = poiOccupancyKeysFromRow(poi);
  if (keys.placeId && occupied.placeIds.has(keys.placeId)) return true;
  if (keys.name && occupied.names.has(keys.name)) return true;
  return false;
}

export function filterCandidatesExcludingOccupiedPois<T>(
  candidates: T[],
  occupied: OccupiedPoiKeySet,
): { kept: T[]; excludedCount: number } {
  if (occupied.placeIds.size === 0 && occupied.names.size === 0) {
    return { kept: candidates, excludedCount: 0 };
  }
  const kept: T[] = [];
  let excludedCount = 0;
  for (const row of candidates) {
    const poi =
      row && typeof row === 'object' && 'poi' in (row as object)
        ? ((row as { poi?: Record<string, unknown> }).poi ?? (row as Record<string, unknown>))
        : (row as Record<string, unknown>);
    if (isPoiOccupiedOnOtherDays(poi, occupied)) {
      excludedCount += 1;
      continue;
    }
    kept.push(row);
  }
  return { kept, excludedCount };
}
