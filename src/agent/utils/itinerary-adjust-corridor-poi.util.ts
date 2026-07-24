/**
 * 邻日锚点走廊：POI 候选过滤 + 沿路径聚类（替代 ITINERARY_ADJUST 下 skipGeoCluster 直取 TopN）。
 */

import type { GeoPoint, ItineraryAdjustSpatialConstraints } from './itinerary-adjust-neighbor-anchors.util';

const EARTH_RADIUS_KM = 6371;

/**
 * 南岸（维克/冰河湖）→ 斯奈山半岛：黄金圈在直线走廊内侧，需显式剔除内陆核心区绕路点。
 */
export function shouldExcludeIcelandGoldenCircleInlandDetour(
  poi: GeoPoint,
  startAnchor: GeoPoint,
  endAnchor: GeoPoint,
): boolean {
  const southToPeninsula =
    startAnchor.lat < 64.2 && endAnchor.lat > 64.55 && endAnchor.lng < -21.5;
  if (!southToPeninsula) return false;
  return (
    poi.lat >= 64.05 &&
    poi.lat <= 64.42 &&
    poi.lng >= -21.4 &&
    poi.lng <= -19.85
  );
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

/** 点到线段最短距离（大圆近似：端点平面插值 + haversine） */
export function distanceToSegmentKm(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const abKm = haversineKm(a, b);
  if (abKm < 0.05) return haversineKm(p, a);

  const latMid = (a.lat + b.lat) / 2;
  const cosLat = Math.cos((latMid * Math.PI) / 180) || 1e-6;
  const ax = a.lng * cosLat;
  const ay = a.lat;
  const bx = b.lng * cosLat;
  const by = b.lat;
  const px = p.lng * cosLat;
  const py = p.lat;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 > 0 ? (apx * abx + apy * aby) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const proj = { lat: ay + t * aby, lng: (ax + t * abx) / cosLat };
  return haversineKm(p, proj);
}

export function poiCoordinates(poi: unknown): GeoPoint | undefined {
  if (!poi || typeof poi !== 'object') return undefined;
  const p = poi as Record<string, unknown>;
  const lat = Number((p.coordinates as GeoPoint | undefined)?.lat ?? p.lat ?? NaN);
  const lng = Number((p.coordinates as GeoPoint | undefined)?.lng ?? p.lng ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

export type CorridorBufferFilterOptions = {
  /** 改排走廊模式：无坐标 POI 不得进入草案（禁止 fallback 放行） */
  requireCoordinates?: boolean;
};

export function filterPoisWithinCorridorBuffer<T>(
  candidates: T[],
  constraints: ItineraryAdjustSpatialConstraints,
  getCoords: (row: T) => GeoPoint | undefined = poiCoordinates,
  options?: CorridorBufferFilterOptions,
): T[] {
  const { startAnchor, endAnchor, maxDetourDistanceKm } = constraints;
  const matched: T[] = [];
  const fallbackNoCoords: T[] = [];

  for (const row of candidates) {
    const c = getCoords(row);
    if (!c) {
      if (!options?.requireCoordinates) {
        fallbackNoCoords.push(row);
      }
      continue;
    }
    if (shouldExcludeIcelandGoldenCircleInlandDetour(c, startAnchor, endAnchor)) continue;
    const d = distanceToSegmentKm(c, startAnchor, endAnchor);
    if (d > maxDetourDistanceKm) continue;
    const directKm = haversineKm(startAnchor, endAnchor);
    const viaKm = haversineKm(startAnchor, c) + haversineKm(c, endAnchor);
    const maxRatio = constraints.maxRouteDetourRatio ?? 1.35;
    if (directKm > 30 && viaKm > directKm * maxRatio) continue;
    matched.push(row);
  }

  if (matched.length > 0) return matched;
  if (options?.requireCoordinates) return [];
  return fallbackNoCoords.length > 0 ? fallbackNoCoords : candidates;
}

/**
 * 沿 start→end 走廊贪心选点：优先距当前锚点近、且仍在缓冲区内。
 */
export function selectClusteredPoisAlongCorridor<T>(
  candidates: T[],
  limit: number,
  constraints: ItineraryAdjustSpatialConstraints,
  options?: {
    maxLegKm?: number;
    getCoords?: (row: T) => GeoPoint | undefined;
  },
): T[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (candidates.length <= limit) return candidates.slice(0, limit);

  const getCoords = options?.getCoords ?? poiCoordinates;
  const maxLegKm = options?.maxLegKm ?? Math.min(80, constraints.maxDetourDistanceKm + 15);
  const inCorridor = filterPoisWithinCorridorBuffer(candidates, constraints, getCoords);

  const pool = inCorridor
    .map((poi) => {
      const c = getCoords(poi);
      if (!c) return { poi, sortKey: Number.POSITIVE_INFINITY };
      const midDist = distanceToSegmentKm(c, constraints.startAnchor, constraints.endAnchor);
      const fromStart = haversineKm(c, constraints.startAnchor);
      return { poi, sortKey: midDist * 2 + fromStart * 0.15 };
    })
    .sort((a, b) => a.sortKey - b.sortKey);

  const selected: T[] = [];
  let cursor: GeoPoint = constraints.startAnchor;

  while (selected.length < limit && pool.length > 0) {
    let bestIdx = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pool.length; i++) {
      const c = getCoords(pool[i].poi);
      if (!c) continue;
      if (shouldExcludeIcelandGoldenCircleInlandDetour(c, constraints.startAnchor, constraints.endAnchor)) {
        continue;
      }
      const leg = haversineKm(cursor, c);
      if (leg > maxLegKm) continue;
      const corridor = distanceToSegmentKm(c, constraints.startAnchor, constraints.endAnchor);
      if (corridor > constraints.maxDetourDistanceKm) continue;
      const directKm = haversineKm(constraints.startAnchor, constraints.endAnchor);
      const viaKm = haversineKm(constraints.startAnchor, c) + haversineKm(c, constraints.endAnchor);
      const maxRatio = constraints.maxRouteDetourRatio ?? 1.35;
      if (directKm > 30 && viaKm > directKm * maxRatio) continue;
      const score = leg + corridor * 0.3;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const [picked] = pool.splice(bestIdx, 1);
    selected.push(picked.poi);
    const pc = getCoords(picked.poi);
    if (pc) cursor = pc;
  }

  if (selected.length === 0) {
    return inCorridor.slice(0, limit);
  }
  return selected.slice(0, limit);
}

export function corridorScoreBoostForPoi(
  poi: unknown,
  constraints: ItineraryAdjustSpatialConstraints,
): number {
  const c = poiCoordinates(poi);
  if (!c) return 0;
  const d = distanceToSegmentKm(c, constraints.startAnchor, constraints.endAnchor);
  if (d > constraints.maxDetourDistanceKm) return -4;
  if (d <= constraints.maxDetourDistanceKm * 0.35) return 3;
  if (d <= constraints.maxDetourDistanceKm * 0.65) return 1.5;
  return 0;
}
