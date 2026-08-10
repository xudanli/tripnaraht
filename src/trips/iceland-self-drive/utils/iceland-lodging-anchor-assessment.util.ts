/**
 * Confirmed lodging overnight expectations + Golden Set lodging catalog helpers.
 * Shared by Shadow assess and platform peer so severity stays aligned.
 */

import { ICELAND_REGION_PLANNING_PACKS } from '../packs/iceland-region-planning-packs';

export type ConfirmedLodgingRef = {
  placeId: number;
  label?: string;
  nightDate?: string;
};

export type LodgingAnchorDay = {
  date: string;
  dayIndex: number;
  lodgingAnchor?: {
    placeId?: number;
    label?: string;
    nightDate?: string;
    source?: string;
  };
  endAnchor?: {
    placeId?: number;
    label?: string;
    nightDate?: string;
    source?: string;
  };
  packIds?: string[];
  itemCount: number;
};

let cachedLodgingPlaceIds: Set<number> | null = null;
let cachedLodgingPackByPlace: Map<number, string[]> | null = null;

function ensureLodgingCatalog(): void {
  if (cachedLodgingPlaceIds) return;
  cachedLodgingPlaceIds = new Set();
  cachedLodgingPackByPlace = new Map();
  for (const pack of ICELAND_REGION_PLANNING_PACKS) {
    for (const e of pack.entities) {
      if (e.entityType !== 'LODGING' || typeof e.placeId !== 'number') continue;
      cachedLodgingPlaceIds.add(e.placeId);
      const packs = cachedLodgingPackByPlace.get(e.placeId) ?? [];
      packs.push(pack.packId);
      cachedLodgingPackByPlace.set(e.placeId, packs);
    }
  }
}

export function isGoldenSetLodgingPlaceId(placeId: number): boolean {
  ensureLodgingCatalog();
  return cachedLodgingPlaceIds!.has(placeId);
}

export function lodgingPackIdsForPlace(placeId: number): string[] {
  ensureLodgingCatalog();
  return cachedLodgingPackByPlace!.get(placeId) ?? [];
}

/** Mirror assignOvernightAnchors dated + undated coverage (by day array index). */
export function expectedConfirmedLodgingByDayIndex(
  days: Array<{ date: string }>,
  confirmed: ConfirmedLodgingRef[],
): Map<number, ConfirmedLodgingRef & { nightDate: string }> {
  const map = new Map<number, ConfirmedLodgingRef & { nightDate: string }>();
  if (!days.length || !confirmed.length) return map;

  const hardFilled = new Set<number>();
  for (const lodging of confirmed) {
    if (!lodging.nightDate) continue;
    const idx = days.findIndex((d) => d.date === lodging.nightDate);
    if (idx < 0) continue;
    map.set(idx, {
      placeId: lodging.placeId,
      label: lodging.label,
      nightDate: lodging.nightDate,
    });
    hardFilled.add(idx);
  }

  const undated = confirmed.filter((l) => !l.nightDate);
  if (undated.length) {
    for (let i = 0; i < days.length; i++) {
      if (hardFilled.has(i)) continue;
      const pick = undated[Math.min(i, undated.length - 1)]!;
      map.set(i, {
        placeId: pick.placeId,
        label: pick.label,
        nightDate: days[i]!.date,
      });
    }
  }

  return map;
}

export function resolveLodgingAnchor(
  day: LodgingAnchorDay,
): LodgingAnchorDay['lodgingAnchor'] {
  return day.lodgingAnchor?.placeId != null
    ? day.lodgingAnchor
    : day.endAnchor;
}

/** True when lodging packs don't intersect day activity packs (soft remoteness). */
export function isLodgingRemoteFromDay(
  lodgingPlaceId: number,
  dayPackIds: string[] | undefined,
): boolean {
  const lodgingPacks = lodgingPackIdsForPlace(lodgingPlaceId);
  if (!lodgingPacks.length || !dayPackIds?.length) return false;
  return !lodgingPacks.some((p) => dayPackIds.includes(p));
}
