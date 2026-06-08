/**
 * ITINERARY_ADJUST：从绑定 Trip 全周行程提取 D(N-1) 尾 / D(N+1) 头锚点，约束单日重排可行域。
 */

import { extractItineraryAdjustTargetDateFromMessage } from './itinerary-adjust-intent.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

export type GeoPoint = { lat: number; lng: number };

/** 雷克雅未克凯夫拉维克机场（KEF）近似坐标，首末日无邻日锚点时的默认端点 */
export const ICELAND_KEF_AIRPORT: GeoPoint = { lat: 63.985, lng: -22.6056 };

const ANCHOR_ITEM_TYPES = new Set([
  'POI',
  'ACTIVITY',
  'HOTEL',
  'RESTAURANT',
  'VIEWPOINT',
  'SHOPPING',
  'NATURE',
]);

export type TripDayAnchorItem = {
  type?: string | null;
  placeId?: number | null;
  lat?: number | null;
  lng?: number | null;
  name?: string | null;
  startTime?: Date | string | null;
  order?: number | null;
};

export type TripDayAnchorRow = {
  dateIso: string;
  dayNumber: number;
  items: TripDayAnchorItem[];
};

export type NeighborAnchorContext = {
  targetDateIso: string;
  targetDayNumber: number;
  startAnchor: GeoPoint;
  endAnchor: GeoPoint;
  startAnchorSource: 'prev_day_last' | 'trip_origin' | 'kef_default';
  endAnchorSource: 'next_day_first' | 'trip_destination' | 'kef_default';
};

export type ItineraryAdjustSpatialConstraints = {
  startAnchor: GeoPoint;
  endAnchor: GeoPoint;
  maxDetourDistanceKm: number;
  /** 途经点总里程 / 起终点直达里程 上限（剔除黄金圈折返类绕路） */
  maxRouteDetourRatio?: number;
  mode: 'DAY_REPLAN_INTERPOLATION';
};

export function coordsFromPoiLike(poi: {
  coordinates?: { lat?: number; lng?: number };
  lat?: number;
  lng?: number;
}): GeoPoint | undefined {
  const lat = Number(poi.coordinates?.lat ?? poi.lat ?? NaN);
  const lng = Number(poi.coordinates?.lng ?? poi.lng ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function coordsFromTripItem(item: TripDayAnchorItem): GeoPoint | undefined {
  const lat = Number(item.lat ?? NaN);
  const lng = Number(item.lng ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function isAnchorEligibleType(type: string | null | undefined): boolean {
  const t = String(type ?? 'POI').trim().toUpperCase();
  return ANCHOR_ITEM_TYPES.has(t);
}

function sortItemsForAnchor(items: TripDayAnchorItem[]): TripDayAnchorItem[] {
  return [...items].sort((a, b) => {
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    const ta = a.startTime ? new Date(a.startTime as string).getTime() : 0;
    const tb = b.startTime ? new Date(b.startTime as string).getTime() : 0;
    return ta - tb;
  });
}

export function pickLastAnchoredPoint(items: TripDayAnchorItem[]): GeoPoint | undefined {
  const sorted = sortItemsForAnchor(items);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const it = sorted[i];
    if (!isAnchorEligibleType(it.type)) continue;
    const c = coordsFromTripItem(it);
    if (c) return c;
  }
  return undefined;
}

export function pickFirstAnchoredPoint(items: TripDayAnchorItem[]): GeoPoint | undefined {
  const sorted = sortItemsForAnchor(items);
  for (const it of sorted) {
    if (!isAnchorEligibleType(it.type)) continue;
    const c = coordsFromTripItem(it);
    if (c) return c;
  }
  return undefined;
}

export function resolveItineraryAdjustTargetDayNumber(
  days: TripDayAnchorRow[],
  targetDateIso: string,
): number | undefined {
  const hit = days.find((d) => d.dateIso.slice(0, 10) === targetDateIso.slice(0, 10));
  return hit?.dayNumber;
}

/**
 * 从已排序的 Trip 日快照提取邻日锚点；首末日回退 KEF / 显式起终点。
 */
export function extractNeighborAnchors(
  days: TripDayAnchorRow[],
  targetDateIso: string,
  options?: {
    origin?: GeoPoint;
    destination?: GeoPoint;
    airportFallback?: GeoPoint;
  },
): NeighborAnchorContext | null {
  const target = targetDateIso.slice(0, 10);
  if (!target || days.length === 0) return null;

  const sorted = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const idx = sorted.findIndex((d) => d.dateIso.slice(0, 10) === target);
  if (idx < 0) return null;

  const airport = options?.airportFallback ?? ICELAND_KEF_AIRPORT;
  const prev = idx > 0 ? sorted[idx - 1] : undefined;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : undefined;

  let startAnchor: GeoPoint;
  let startAnchorSource: NeighborAnchorContext['startAnchorSource'];
  const prevTail = prev ? pickLastAnchoredPoint(prev.items) : undefined;
  if (prevTail) {
    startAnchor = prevTail;
    startAnchorSource = 'prev_day_last';
  } else if (options?.origin) {
    startAnchor = options.origin;
    startAnchorSource = 'trip_origin';
  } else {
    startAnchor = airport;
    startAnchorSource = 'kef_default';
  }

  let endAnchor: GeoPoint;
  let endAnchorSource: NeighborAnchorContext['endAnchorSource'];
  const nextHead = next ? pickFirstAnchoredPoint(next.items) : undefined;
  if (nextHead) {
    endAnchor = nextHead;
    endAnchorSource = 'next_day_first';
  } else if (options?.destination) {
    endAnchor = options.destination;
    endAnchorSource = 'trip_destination';
  } else {
    endAnchor = airport;
    endAnchorSource = 'kef_default';
  }

  return {
    targetDateIso: target,
    targetDayNumber: sorted[idx].dayNumber,
    startAnchor,
    endAnchor,
    startAnchorSource,
    endAnchorSource,
  };
}

export function buildItineraryAdjustSpatialConstraints(
  anchors: NeighborAnchorContext,
  maxDetourDistanceKm = 50,
  maxRouteDetourRatio = 1.32,
): ItineraryAdjustSpatialConstraints {
  return {
    startAnchor: anchors.startAnchor,
    endAnchor: anchors.endAnchor,
    maxDetourDistanceKm,
    maxRouteDetourRatio,
    mode: 'DAY_REPLAN_INTERPOLATION',
  };
}

export function resolveTargetDateForAdjust(
  message: string | undefined,
  dateRange?: { start_date?: string; end_date?: string },
): string | undefined {
  if (!message?.trim()) return undefined;
  return extractItineraryAdjustTargetDateFromMessage(
    stripSystemMessageBlocksForIntakeNl(message),
    dateRange,
  );
}
