/**
 * Overnight anchors for Initial Plan Preview days.
 * 1) Confirmed bookings (hard)
 * 2) Golden Set LODGING support nodes (soft) for remaining nights
 */

import type { PlaceRef } from '../types/iceland-initial-plan-seed.types';

export type OvernightAnchorSource = 'CONFIRMED_BOOKING' | 'GOLDEN_SET_SOFT';

export type OvernightDay = {
  date: string;
  packIds?: string[];
  /** Attraction regionIds on this day (optional hint) */
  regionIds?: string[];
  startAnchor?: PlaceRef;
  endAnchor?: PlaceRef;
};

export type SoftLodgingCandidate = {
  placeId: number;
  label: string;
  regionId: string;
  packId?: string;
};

function asConfirmed(
  l: PlaceRef,
): (PlaceRef & { placeId: number }) | null {
  if (typeof l.placeId !== 'number' || l.placeId <= 0) return null;
  return l as PlaceRef & { placeId: number };
}

function setEndAnchor(
  days: OvernightDay[],
  dayIndex: number,
  ref: PlaceRef,
): void {
  const day = days[dayIndex];
  if (!day) return;
  day.endAnchor = ref;
  if (dayIndex + 1 < days.length) {
    days[dayIndex + 1]!.startAnchor = { ...ref };
  }
}

function pickSoftLodging(
  day: OvernightDay,
  soft: SoftLodgingCandidate[],
  previousPlaceId?: number,
): SoftLodgingCandidate | null {
  if (!soft.length) return null;

  const packIds = new Set(day.packIds ?? []);
  const regionIds = new Set(day.regionIds ?? []);

  const byPack = soft.filter((s) => s.packId && packIds.has(s.packId));
  const byRegion = soft.filter((s) => regionIds.has(s.regionId));
  const pool = byPack.length ? byPack : byRegion.length ? byRegion : soft;

  if (previousPlaceId != null) {
    const sticky = pool.find((s) => s.placeId === previousPlaceId);
    if (sticky) return sticky;
  }
  return pool[0] ?? null;
}

/**
 * Mutates days in place.
 * Confirmed nights win; remaining nights get Golden Set LODGING soft picks.
 */
export function assignOvernightAnchors(
  days: OvernightDay[],
  input: {
    confirmedLodgings?: PlaceRef[];
    softLodgings?: SoftLodgingCandidate[];
  },
): void {
  if (!days.length) return;

  const confirmed = (input.confirmedLodgings ?? [])
    .map(asConfirmed)
    .filter((l): l is PlaceRef & { placeId: number } => l != null);
  const soft = input.softLodgings ?? [];

  const hardFilled = new Set<number>();

  // 1) Dated confirmed bookings
  for (const lodging of confirmed) {
    if (!lodging.nightDate) continue;
    const idx = days.findIndex((d) => d.date === lodging.nightDate);
    if (idx < 0) continue;
    setEndAnchor(days, idx, {
      placeId: lodging.placeId,
      label: lodging.label,
      nightDate: lodging.nightDate,
      source: 'CONFIRMED_BOOKING',
    });
    hardFilled.add(idx);
  }

  // 2) Undated confirmed — fill remaining nights (index clamp)
  const undated = confirmed.filter((l) => !l.nightDate);
  if (undated.length) {
    for (let i = 0; i < days.length; i++) {
      if (hardFilled.has(i)) continue;
      const pick = undated[Math.min(i, undated.length - 1)]!;
      setEndAnchor(days, i, {
        placeId: pick.placeId,
        label: pick.label,
        nightDate: days[i]!.date,
        source: 'CONFIRMED_BOOKING',
      });
      hardFilled.add(i);
    }
  }

  // 3) Soft Golden Set for nights still empty
  if (!soft.length) return;
  let prevPlaceId: number | undefined;
  for (let i = 0; i < days.length; i++) {
    if (days[i]!.endAnchor?.placeId != null) {
      prevPlaceId = days[i]!.endAnchor!.placeId;
      continue;
    }
    const pick = pickSoftLodging(days[i]!, soft, prevPlaceId);
    if (!pick) continue;
    setEndAnchor(days, i, {
      placeId: pick.placeId,
      label: pick.label,
      nightDate: days[i]!.date,
      source: 'GOLDEN_SET_SOFT',
    });
    prevPlaceId = pick.placeId;
  }

  // Re-sync startAnchors from previous endAnchors (confirmed may have overwritten out of order)
  for (let i = 0; i < days.length - 1; i++) {
    const end = days[i]!.endAnchor;
    if (end?.placeId != null) {
      days[i + 1]!.startAnchor = { ...end };
    }
  }
}

/**
 * Preview overnight lodging placeIds by calendar date from confirmed bookings only
 * (soft fill needs day packs — applied later in assignOvernightAnchors).
 */
export function mapConfirmedOvernightByDate(
  dates: string[],
  confirmedLodgings?: PlaceRef[],
): {
  /** Night lodging for this date (endAnchor) */
  endByDate: Map<string, number>;
  /** Morning lodging for this date (startAnchor = previous night) */
  startByDate: Map<string, number>;
} {
  const endByDate = new Map<string, number>();
  const startByDate = new Map<string, number>();
  if (!dates.length) return { endByDate, startByDate };

  const confirmed = (confirmedLodgings ?? [])
    .map(asConfirmed)
    .filter((l): l is PlaceRef & { placeId: number } => l != null);
  if (!confirmed.length) return { endByDate, startByDate };

  const hardFilled = new Set<number>();
  for (const lodging of confirmed) {
    if (!lodging.nightDate) continue;
    const idx = dates.indexOf(lodging.nightDate);
    if (idx < 0) continue;
    endByDate.set(dates[idx]!, lodging.placeId);
    hardFilled.add(idx);
  }
  const undated = confirmed.filter((l) => !l.nightDate);
  if (undated.length) {
    for (let i = 0; i < dates.length; i++) {
      if (hardFilled.has(i)) continue;
      const pick = undated[Math.min(i, undated.length - 1)]!;
      endByDate.set(dates[i]!, pick.placeId);
    }
  }
  for (let i = 0; i < dates.length - 1; i++) {
    const end = endByDate.get(dates[i]!);
    if (end != null) startByDate.set(dates[i + 1]!, end);
  }
  return { endByDate, startByDate };
}

/** @deprecated use assignOvernightAnchors */
export function assignConfirmedLodgingAnchors(
  days: OvernightDay[],
  confirmedLodgings?: PlaceRef[],
): void {
  assignOvernightAnchors(days, { confirmedLodgings });
}
