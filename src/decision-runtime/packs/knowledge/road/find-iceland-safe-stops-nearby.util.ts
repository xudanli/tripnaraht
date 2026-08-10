/**
 * Radius search over curated Iceland safe-stop catalog (for nearby-poi REST_AREA / GAS).
 */

import { haversineKm } from '../../../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import { loadIcelandSafeStopCatalog } from './iceland-safe-stop.loader';
import type { IcelandSafeStop, IcelandSafeStopKind } from './iceland-safe-stop.types';

export type IcelandSafeStopNearbyHit = IcelandSafeStop & {
  distanceMeters: number;
};

export const ICELAND_REST_AREA_SAFE_STOP_KINDS: IcelandSafeStopKind[] = [
  'REST_AREA',
  'ATTRACTION_PARKING',
  'HIGHLAND_TRAILHEAD',
];

export const ICELAND_GAS_SAFE_STOP_KINDS: IcelandSafeStopKind[] = ['FUEL_SERVICES'];

export function findIcelandSafeStopsNearby(input: {
  lat: number;
  lng: number;
  radiusMeters: number;
  kinds?: IcelandSafeStopKind[];
  /** Also keep FUEL_SERVICES that advertise REST_AREA / PARKING / TOILET */
  includeServiceRestAmenities?: boolean;
  cwd?: string;
}): IcelandSafeStopNearbyHit[] {
  const {
    lat,
    lng,
    radiusMeters,
    kinds,
    includeServiceRestAmenities = false,
    cwd = process.cwd(),
  } = input;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return [];
  }

  const kindSet = kinds?.length ? new Set(kinds) : null;
  const maxKm = radiusMeters / 1000;
  const catalog = loadIcelandSafeStopCatalog(cwd);
  const hits: IcelandSafeStopNearbyHit[] = [];

  for (const stop of catalog.stops) {
    const distanceKm = haversineKm(lat, lng, stop.lat, stop.lng);
    if (distanceKm > maxKm) continue;

    const kindOk = !kindSet || kindSet.has(stop.kind);
    const amenityRest =
      includeServiceRestAmenities &&
      stop.kind === 'FUEL_SERVICES' &&
      stop.amenities.some((a) => a === 'REST_AREA' || a === 'PARKING' || a === 'TOILET');

    if (!kindOk && !amenityRest) continue;

    hits.push({ ...stop, distanceMeters: Math.round(distanceKm * 1000) });
  }

  hits.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return hits;
}

/** Stable positive int for NearbyPoiResultDto.id (catalog poiId is string). */
export function hashSafeStopPoiId(poiId: string): number {
  let h = 0;
  for (let i = 0; i < poiId.length; i++) {
    h = (Math.imul(31, h) + poiId.charCodeAt(i)) | 0;
  }
  const n = Math.abs(h);
  return n === 0 ? 1 : n;
}

export function labelIcelandSafeStop(stop: IcelandSafeStop): { nameCN: string; nameEN: string } {
  const kindZh: Record<IcelandSafeStopKind, string> = {
    REST_AREA: '休息区',
    ATTRACTION_PARKING: '停车休息',
    HIGHLAND_TRAILHEAD: '高地停车点',
    FUEL_SERVICES: '补给服务',
    OTHER: '停靠点',
  };
  return {
    nameEN: stop.name,
    nameCN: `${stop.name}（${kindZh[stop.kind] ?? '停靠点'}）`,
  };
}
