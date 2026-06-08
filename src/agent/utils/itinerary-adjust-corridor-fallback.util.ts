/**
 * ITINERARY_ADJUST 走廊候选不足：阶梯 buffer 扩容 → 锚点半径补足 →（由宿主触发）poi.search 兜底。
 */

import type {
  GeoPoint,
  ItineraryAdjustSpatialConstraints,
  NeighborAnchorContext,
} from './itinerary-adjust-neighbor-anchors.util';
import { buildItineraryAdjustSpatialConstraints } from './itinerary-adjust-neighbor-anchors.util';
import {
  filterPoisWithinCorridorBuffer,
  haversineKm,
  poiCoordinates,
  shouldExcludeIcelandGoldenCircleInlandDetour,
  distanceToSegmentKm,
  type CorridorBufferFilterOptions,
} from './itinerary-adjust-corridor-poi.util';

function corridorBufferOptions(
  spatial: ItineraryAdjustSpatialConstraints,
): CorridorBufferFilterOptions | undefined {
  return spatial.mode === 'DAY_REPLAN_INTERPOLATION' ? { requireCoordinates: true } : undefined;
}

export const ITINERARY_ADJUST_CORRIDOR_BUFFER_TIERS_KM = [50, 80, 120] as const;
export const ITINERARY_ADJUST_ANCHOR_RADIUS_TIERS_KM = [35, 55] as const;
export const ITINERARY_ADJUST_CORRIDOR_MIN_CANDIDATES_DEFAULT = 3;

export type CorridorFallbackLevel =
  | 'baseline_50km'
  | 'expanded_80km'
  | 'expanded_120km'
  | 'anchor_radius_35km'
  | 'anchor_radius_55km'
  | 'best_effort_sparse';

export type CorridorFilterStats = {
  inputCount: number;
  matched: number;
  droppedOutlier: number;
  droppedGoldenCircle: number;
  noCoords: number;
  bufferKm: number;
};

export type CorridorPoolResolution<T> = {
  candidates: T[];
  spatial: ItineraryAdjustSpatialConstraints;
  fallbackLevel: CorridorFallbackLevel;
  diagnostics: {
    minRequired: number;
    finalCount: number;
    tierAttempts: CorridorFilterStats[];
    anchorRadiusKm?: number;
    poiSearchSupplementCount?: number;
  };
};

function fallbackLevelForBufferKm(km: number): CorridorFallbackLevel {
  if (km <= 50) return 'baseline_50km';
  if (km <= 80) return 'expanded_80km';
  return 'expanded_120km';
}

function fallbackLevelForAnchorRadiusKm(km: number): CorridorFallbackLevel {
  return km <= 35 ? 'anchor_radius_35km' : 'anchor_radius_55km';
}

export function countCorridorFilterStats<T>(
  candidates: T[],
  constraints: ItineraryAdjustSpatialConstraints,
  getCoords: (row: T) => GeoPoint | undefined = poiCoordinates,
): CorridorFilterStats {
  const { startAnchor, endAnchor, maxDetourDistanceKm } = constraints;
  let matched = 0;
  let droppedOutlier = 0;
  let droppedGoldenCircle = 0;
  let noCoords = 0;

  for (const row of candidates) {
    const c = getCoords(row);
    if (!c) {
      noCoords++;
      continue;
    }
    if (shouldExcludeIcelandGoldenCircleInlandDetour(c, startAnchor, endAnchor)) {
      droppedGoldenCircle++;
      continue;
    }
    const d = distanceToSegmentKm(c, startAnchor, endAnchor);
    if (d > maxDetourDistanceKm) {
      droppedOutlier++;
      continue;
    }
    const directKm = haversineKm(startAnchor, endAnchor);
    const viaKm = haversineKm(startAnchor, c) + haversineKm(c, endAnchor);
    const maxRatio = constraints.maxRouteDetourRatio ?? 1.35;
    if (directKm > 30 && viaKm > directKm * maxRatio) {
      droppedOutlier++;
      continue;
    }
    matched++;
  }

  return {
    inputCount: candidates.length,
    matched,
    droppedOutlier,
    droppedGoldenCircle,
    noCoords,
    bufferKm: maxDetourDistanceKm,
  };
}

/** 距 start 或 end 锚点任一端在半径内（仍剔除冰岛黄金圈内陆绕路点） */
export function filterPoisNearCorridorAnchors<T>(
  candidates: T[],
  constraints: ItineraryAdjustSpatialConstraints,
  radiusKm: number,
  getCoords: (row: T) => GeoPoint | undefined = poiCoordinates,
): T[] {
  const { startAnchor, endAnchor } = constraints;
  const matched: T[] = [];
  for (const row of candidates) {
    const c = getCoords(row);
    if (!c) continue;
    if (shouldExcludeIcelandGoldenCircleInlandDetour(c, startAnchor, endAnchor)) continue;
    const nearStart = haversineKm(c, startAnchor) <= radiusKm;
    const nearEnd = haversineKm(c, endAnchor) <= radiusKm;
    if (!nearStart && !nearEnd) continue;
    matched.push(row);
  }
  return matched;
}

export function corridorSearchLatLng(
  spatial: ItineraryAdjustSpatialConstraints,
): { lat: number; lng: number } {
  return {
    lat: (spatial.startAnchor.lat + spatial.endAnchor.lat) / 2,
    lng: (spatial.startAnchor.lng + spatial.endAnchor.lng) / 2,
  };
}

export function buildItineraryAdjustCorridorPoiSearchQuery(
  destinationRaw: string,
  anchors: NeighborAnchorContext,
): string {
  const isIceland = /冰岛|iceland/i.test(destinationRaw);
  const southToPeninsula =
    anchors.startAnchor.lat < 64.2 &&
    anchors.endAnchor.lat > 64.55 &&
    anchors.endAnchor.lng < -21.5;
  if (isIceland && southToPeninsula) {
    return 'Iceland south coast Seljalandsfoss Skogafoss Reynisfjara waterfall viewpoint attractions';
  }
  const dest = destinationRaw.trim() || 'Iceland';
  return `${dest} route corridor attractions landmarks sightseeing viewpoints`;
}

export function resolveItineraryAdjustCorridorCandidatePool<T>(
  candidates: T[],
  baseSpatial: ItineraryAdjustSpatialConstraints,
  minRequired = ITINERARY_ADJUST_CORRIDOR_MIN_CANDIDATES_DEFAULT,
  getCoords: (row: T) => GeoPoint | undefined = poiCoordinates,
): CorridorPoolResolution<T> {
  const tierAttempts: CorridorFilterStats[] = [];
  let bestPool: T[] = [];
  let bestSpatial = baseSpatial;
  let bestLevel: CorridorFallbackLevel = 'best_effort_sparse';
  let bestCount = 0;

  for (const bufferKm of ITINERARY_ADJUST_CORRIDOR_BUFFER_TIERS_KM) {
    const spatial: ItineraryAdjustSpatialConstraints = {
      ...baseSpatial,
      maxDetourDistanceKm: bufferKm,
    };
    const stats = countCorridorFilterStats(candidates, spatial, getCoords);
    tierAttempts.push(stats);
    const pool = filterPoisWithinCorridorBuffer(
      candidates,
      spatial,
      getCoords,
      corridorBufferOptions(spatial),
    );
    if (pool.length > bestCount) {
      bestCount = pool.length;
      bestPool = pool;
      bestSpatial = spatial;
      bestLevel = fallbackLevelForBufferKm(bufferKm);
    }
    if (pool.length >= minRequired) {
      return {
        candidates: pool,
        spatial,
        fallbackLevel: fallbackLevelForBufferKm(bufferKm),
        diagnostics: {
          minRequired,
          finalCount: pool.length,
          tierAttempts,
        },
      };
    }
  }

  for (const radiusKm of ITINERARY_ADJUST_ANCHOR_RADIUS_TIERS_KM) {
    const spatial: ItineraryAdjustSpatialConstraints = {
      ...baseSpatial,
      maxDetourDistanceKm: ITINERARY_ADJUST_CORRIDOR_BUFFER_TIERS_KM.at(-1)!,
    };
    const pool = filterPoisNearCorridorAnchors(candidates, spatial, radiusKm, getCoords);
    if (pool.length > bestCount) {
      bestCount = pool.length;
      bestPool = pool;
      bestSpatial = spatial;
      bestLevel = fallbackLevelForAnchorRadiusKm(radiusKm);
    }
    if (pool.length >= minRequired) {
      return {
        candidates: pool,
        spatial,
        fallbackLevel: fallbackLevelForAnchorRadiusKm(radiusKm),
        diagnostics: {
          minRequired,
          finalCount: pool.length,
          tierAttempts,
          anchorRadiusKm: radiusKm,
        },
      };
    }
  }

  const requireCoords = baseSpatial.mode === 'DAY_REPLAN_INTERPOLATION';
  return {
    candidates: bestPool,
    spatial: bestSpatial,
    fallbackLevel: bestPool.length > 0 ? bestLevel : 'best_effort_sparse',
    diagnostics: {
      minRequired,
      finalCount: bestPool.length,
      tierAttempts,
      anchorRadiusKm: ITINERARY_ADJUST_ANCHOR_RADIUS_TIERS_KM.at(-1),
      ...(requireCoords ? { coordinates_required: true } : {}),
    },
  };
}

/** 将邻日锚点约束与默认 buffer 合成（供测试与宿主复用） */
export function spatialConstraintsWithBuffer(
  anchors: NeighborAnchorContext,
  bufferKm: number,
  maxRouteDetourRatio?: number,
): ItineraryAdjustSpatialConstraints {
  return buildItineraryAdjustSpatialConstraints(
    anchors,
    bufferKm,
    maxRouteDetourRatio ?? 1.32,
  );
}
