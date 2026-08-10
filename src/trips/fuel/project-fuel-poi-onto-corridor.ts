/**
 * Project fuel POIs onto the trip drive corridor.
 *
 * Arc lengths are in the same km space as FuelPolylineInput / distanceKm cumulatives
 * (not raw haversine of the whole trip), so reachability and FuelAssessment stay consistent.
 */

import { haversineKm } from '../attraction-explore/utils/attraction-explore-place-coordinates.util';
import type { TripPlan } from '../decision/plan-model';
import type { GeoPoint } from '../decision/world-model';
import type { FuelPoiIndexEntry } from './fuel-reachability.types';

export interface CorridorSegment {
  from: GeoPoint;
  to: GeoPoint;
  /** Inclusive start along trip corridor (km). */
  arcStartKm: number;
  /** Exclusive-ish end = arcStartKm + distanceKm. */
  arcEndKm: number;
  distanceKm: number;
  legId: string;
  date: string;
}

export interface ProjectFuelOntoCorridorOptions {
  /** Max lateral distance (km) to accept a snap onto the corridor. */
  maxSnapKm?: number;
  /** Optional denser corridor vertices (e.g. decoded route polyline), in trip order. */
  denserCoordinates?: ReadonlyArray<GeoPoint>;
}

export interface FuelArcProjection {
  arcKmAlongRoute: number;
  detourKm: number;
  segmentLegId: string;
}

const DEFAULT_MAX_SNAP_KM = 30;

function isFinitePoint(p?: GeoPoint | null): p is GeoPoint {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

/**
 * Build corridor segments from plan drive legs.
 * Segment length uses declared distanceKm (fuel SSOT); geometry is from/to for projection.
 */
export function buildDriveCorridorSegments(plan: TripPlan): CorridorSegment[] {
  const segments: CorridorSegment[] = [];
  let cumulative = 0;
  let prevPoint: GeoPoint | undefined;

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const tl = slot.travelLegFromPrev;
      if (!tl || tl.mode !== 'drive') {
        if (isFinitePoint(slot.coordinates)) prevPoint = slot.coordinates;
        continue;
      }
      const distanceKm =
        typeof tl.distanceKm === 'number' && tl.distanceKm > 0 ? tl.distanceKm : 0;
      if (distanceKm <= 0) continue;

      const from = isFinitePoint(tl.from)
        ? tl.from
        : isFinitePoint(prevPoint)
          ? prevPoint
          : undefined;
      const to = isFinitePoint(tl.to)
        ? tl.to
        : isFinitePoint(slot.coordinates)
          ? slot.coordinates
          : undefined;

      if (from && to) {
        segments.push({
          from,
          to,
          arcStartKm: cumulative,
          arcEndKm: cumulative + distanceKm,
          distanceKm,
          legId: slot.id,
          date: day.date,
        });
      }

      cumulative += distanceKm;
      prevPoint = to ?? (isFinitePoint(slot.coordinates) ? slot.coordinates : prevPoint);
    }
  }

  return segments;
}

/**
 * When a denser polyline is available, split each drive leg's distanceKm across
 * consecutive denser vertices that fall near that leg's from→to chord.
 * Fallback: return the simple from/to segments.
 */
export function densifyCorridorSegments(
  base: CorridorSegment[],
  denser: ReadonlyArray<GeoPoint>,
): CorridorSegment[] {
  if (base.length === 0 || denser.length < 2) return base;

  const out: CorridorSegment[] = [];
  for (const seg of base) {
    const idxs: number[] = [];
    for (let i = 0; i < denser.length; i++) {
      const p = denser[i]!;
      const dFrom = haversineKm(p.lat, p.lng, seg.from.lat, seg.from.lng);
      const dTo = haversineKm(p.lat, p.lng, seg.to.lat, seg.to.lng);
      const chord = haversineKm(seg.from.lat, seg.from.lng, seg.to.lat, seg.to.lng);
      // Keep points that are roughly on the corridor chord (loose)
      if (dFrom + dTo <= chord + 8) idxs.push(i);
    }
    if (idxs.length < 2) {
      out.push(seg);
      continue;
    }
    idxs.sort((a, b) => a - b);
    const unique = [...new Set(idxs)];
    const pts = unique.map((i) => denser[i]!);
    // Ensure endpoints
    if (
      haversineKm(pts[0]!.lat, pts[0]!.lng, seg.from.lat, seg.from.lng) > 0.5
    ) {
      pts.unshift(seg.from);
    }
    if (
      haversineKm(pts[pts.length - 1]!.lat, pts[pts.length - 1]!.lng, seg.to.lat, seg.to.lng) >
      0.5
    ) {
      pts.push(seg.to);
    }

    const geoLens: number[] = [];
    let geoTotal = 0;
    for (let i = 1; i < pts.length; i++) {
      const len = haversineKm(pts[i - 1]!.lat, pts[i - 1]!.lng, pts[i]!.lat, pts[i]!.lng);
      geoLens.push(len);
      geoTotal += len;
    }
    if (geoTotal <= 0) {
      out.push(seg);
      continue;
    }

    let arc = seg.arcStartKm;
    for (let i = 1; i < pts.length; i++) {
      const share = (geoLens[i - 1]! / geoTotal) * seg.distanceKm;
      out.push({
        from: pts[i - 1]!,
        to: pts[i]!,
        arcStartKm: arc,
        arcEndKm: arc + share,
        distanceKm: share,
        legId: seg.legId,
        date: seg.date,
      });
      arc += share;
    }
  }
  return out;
}

/** Local equirectangular projection of point onto segment; returns t in [0,1] and lateral km. */
export function projectPointOntoSegment(
  point: GeoPoint,
  from: GeoPoint,
  to: GeoPoint,
): { t: number; lateralKm: number; closest: GeoPoint } {
  const lat0 = (((from.lat + to.lat) / 2) * Math.PI) / 180;
  const toXY = (p: GeoPoint) => ({
    x: p.lng * Math.cos(lat0) * 111.32,
    y: p.lat * 110.574,
  });
  const A = toXY(from);
  const B = toXY(to);
  const P = toXY(point);
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const apx = P.x - A.x;
  const apy = P.y - A.y;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 <= 1e-12 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const closest: GeoPoint = {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t,
  };
  const lateralKm = haversineKm(point.lat, point.lng, closest.lat, closest.lng);
  return { t, lateralKm, closest };
}

export function projectFuelPoiOntoCorridor(
  poi: { lat: number; lng: number },
  segments: CorridorSegment[],
  maxSnapKm: number = DEFAULT_MAX_SNAP_KM,
): FuelArcProjection | undefined {
  if (segments.length === 0) return undefined;

  let best: FuelArcProjection | undefined;
  let bestLateral = Number.POSITIVE_INFINITY;

  for (const seg of segments) {
    const { t, lateralKm } = projectPointOntoSegment(poi, seg.from, seg.to);
    if (lateralKm > maxSnapKm) continue;
    if (lateralKm < bestLateral) {
      bestLateral = lateralKm;
      best = {
        arcKmAlongRoute: seg.arcStartKm + t * seg.distanceKm,
        detourKm: lateralKm,
        segmentLegId: seg.legId,
      };
    }
  }
  return best;
}

/**
 * Assign arcKmAlongRoute (+ optional detourKm) for fuel POIs along the plan corridor.
 * Preserves pre-existing arcs. POIs that do not snap within maxSnapKm are left without arcs.
 */
export function assignFuelArcsAlongCorridor(
  plan: TripPlan,
  pois: FuelPoiIndexEntry[],
  options?: ProjectFuelOntoCorridorOptions,
): FuelPoiIndexEntry[] {
  const maxSnapKm = options?.maxSnapKm ?? DEFAULT_MAX_SNAP_KM;
  let segments = buildDriveCorridorSegments(plan);
  if (options?.denserCoordinates?.length) {
    segments = densifyCorridorSegments(segments, options.denserCoordinates);
  }
  if (segments.length === 0) return pois;

  return pois.map((poi) => {
    if (typeof poi.arcKmAlongRoute === 'number' && Number.isFinite(poi.arcKmAlongRoute)) {
      return poi;
    }
    if (typeof poi.lat !== 'number' || typeof poi.lng !== 'number') return poi;
    const hit = projectFuelPoiOntoCorridor(
      { lat: poi.lat, lng: poi.lng },
      segments,
      maxSnapKm,
    );
    if (!hit) return poi;
    return {
      ...poi,
      arcKmAlongRoute: hit.arcKmAlongRoute,
      detourKm: hit.detourKm,
    };
  });
}

export function corridorTotalKm(segments: CorridorSegment[]): number {
  if (segments.length === 0) return 0;
  return segments[segments.length - 1]!.arcEndKm;
}
