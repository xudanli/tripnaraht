/**
 * Resolve nearest curated safe-stop for runbooks.
 * Never invents POIs — miss returns undefined.
 */

import { haversineKm } from '../../../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import { loadIcelandSafeStopCatalog } from './iceland-safe-stop.loader';
import type {
  IcelandSafeStopHit,
  ResolveIcelandSafeStopInput,
} from './iceland-safe-stop.types';

const DEFAULT_MAX_KM = 80;

function normalizeRoadId(id?: string): string | undefined {
  const t = id?.trim().toUpperCase();
  return t || undefined;
}

function rank(
  stop: { roadIds: string[]; corridorTags: string[]; lat: number; lng: number },
  input: ResolveIcelandSafeStopInput,
): { score: number; distanceKm?: number; matchReason: IcelandSafeStopHit['matchReason'] } {
  const roadId = normalizeRoadId(input.roadId);
  const hasCoords =
    typeof input.lat === 'number' &&
    typeof input.lng === 'number' &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);

  const distanceKm = hasCoords
    ? haversineKm(input.lat!, input.lng!, stop.lat, stop.lng)
    : undefined;

  let score = 0;
  let matchReason: IcelandSafeStopHit['matchReason'] = 'NEAREST';

  if (roadId && stop.roadIds.map((r) => r.toUpperCase()).includes(roadId)) {
    score += 100;
    matchReason = 'ROAD_ID';
  }

  const wantedTags = new Set((input.corridorTags ?? []).map((t) => t.toLowerCase()));
  if (wantedTags.size > 0) {
    const hit = stop.corridorTags.some((t) => wantedTags.has(t.toLowerCase()));
    if (hit) {
      score += 40;
      if (matchReason === 'NEAREST') matchReason = 'CORRIDOR';
    }
  }

  if (distanceKm != null) {
    score += Math.max(0, 50 - distanceKm);
  }

  return { score, distanceKm, matchReason };
}

/**
 * Pick best curated safe-stop. Returns undefined when catalog empty / too far / no match.
 */
export function resolveIcelandSafeStop(
  input: ResolveIcelandSafeStopInput,
  cwd: string = process.cwd(),
): IcelandSafeStopHit | undefined {
  const catalog = loadIcelandSafeStopCatalog(cwd);
  if (!catalog.stops.length) return undefined;

  const maxKm = input.maxDistanceKm ?? DEFAULT_MAX_KM;
  const roadId = normalizeRoadId(input.roadId);
  const hasCoords =
    typeof input.lat === 'number' &&
    typeof input.lng === 'number' &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);

  if (!roadId && !hasCoords && !(input.corridorTags?.length)) {
    return undefined;
  }

  let best: IcelandSafeStopHit | undefined;
  let bestScore = -1;

  for (const stop of catalog.stops) {
    const { score, distanceKm, matchReason } = rank(stop, input);
    if (distanceKm != null && distanceKm > maxKm) continue;
    if (score <= 0) continue;
    if (score > bestScore) {
      bestScore = score;
      best = { stop, distanceKm, matchReason };
    } else if (score === bestScore && best) {
      const bestDist = best.distanceKm ?? Number.POSITIVE_INFINITY;
      const candDist = distanceKm ?? Number.POSITIVE_INFINITY;
      if (candDist < bestDist) {
        best = { stop, distanceKm, matchReason };
      }
    }
  }

  return best;
}

/** Validate an explicit poiId against the catalog. */
export function resolveIcelandSafeStopById(
  poiId: string,
  cwd: string = process.cwd(),
): IcelandSafeStopHit | undefined {
  const stop = loadIcelandSafeStopCatalog(cwd).stops.find((s) => s.poiId === poiId);
  if (!stop) return undefined;
  return { stop, matchReason: 'EXPLICIT_ID' };
}
