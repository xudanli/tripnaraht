/**
 * Collect ordered drive-corridor vertices for fuel arc densify.
 *
 * Prefer real road-network polylines (ROUTE_API / CACHED_METADATA) over
 * from→to chords. Never invent shapes — fall back to endpoints when absent.
 */

import type { TripPlan } from '../decision/plan-model';
import type { TravelLeg, GeoPoint } from '../decision/world-model';
import type { TravelRouteGeometryV1 } from '../../transport/contracts/travel-eta.contract';
import type {
  RouteGeometryInput,
  RouteGeometryResult,
} from '../../transport/types/route-geometry.types';
import {
  decodeTravelRouteGeometry,
  encodedPolylineToGeometry,
  mapRouteGeometrySource,
} from './decode-travel-route-geometry';

export type DriveCorridorCoordinate = GeoPoint;

export type RouteGeometryResolver = {
  resolveGeometry: (input: RouteGeometryInput) => Promise<RouteGeometryResult>;
};

export type DriveCorridorLegSource =
  | 'ROUTE_API'
  | 'CACHED_METADATA'
  | 'STRAIGHT_LINE'
  | 'LEG_ENDPOINTS'
  | 'SKIPPED';

export interface DriveCorridorResolveResult {
  denserCoordinates: DriveCorridorCoordinate[];
  legSources: Array<{
    slotId: string;
    source: DriveCorridorLegSource;
    pointCount: number;
  }>;
}

const PREFERRED_SOURCES = new Set<TravelRouteGeometryV1['source']>([
  'ROUTE_API',
  'CACHED_METADATA',
]);

function isFinitePoint(p?: { lat?: number; lng?: number } | null): p is GeoPoint {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

function pushUnique(
  pts: DriveCorridorCoordinate[],
  p: GeoPoint,
  eps = 1e-7,
): void {
  const last = pts[pts.length - 1];
  if (
    last &&
    Math.abs(last.lat - p.lat) < eps &&
    Math.abs(last.lng - p.lng) < eps
  ) {
    return;
  }
  pts.push({ lat: p.lat, lng: p.lng });
}

/** Loose bag fields sometimes present on legs / overlays before typed geometry lands. */
function extractLooseEncodedPolyline(leg: TravelLeg): string | undefined {
  const bag = leg as TravelLeg & {
    encodedPolyline?: string;
    route_encoded_polyline?: string;
  };
  const raw = bag.encodedPolyline ?? bag.route_encoded_polyline;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/**
 * Best geometry already attached to a drive leg (typed or loose polyline).
 * Prefer ROUTE_API / CACHED over STRAIGHT_LINE.
 */
export function extractTravelLegGeometry(
  leg: TravelLeg,
): TravelRouteGeometryV1 | undefined {
  if (leg.geometry && leg.geometry.encoding !== 'NONE' && leg.geometry.value?.trim()) {
    return leg.geometry;
  }
  const loose = extractLooseEncodedPolyline(leg);
  if (loose) {
    return encodedPolylineToGeometry(loose, 'CACHED_METADATA');
  }
  return undefined;
}

function geometryIsPreferredRoadNetwork(g: TravelRouteGeometryV1): boolean {
  if (!PREFERRED_SOURCES.has(g.source)) return false;
  const pts = decodeTravelRouteGeometry(g);
  return pts.length >= 2;
}

/**
 * Sync: decode any polylines already on drive legs; else from/to (+ slot coords).
 */
export function collectDriveCorridorCoordinatesFromPlan(
  plan: TripPlan,
): DriveCorridorCoordinate[] {
  const pts: DriveCorridorCoordinate[] = [];
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const tl = slot.travelLegFromPrev;
      if (tl?.mode === 'drive') {
        const geom = extractTravelLegGeometry(tl);
        const decoded = geom ? decodeTravelRouteGeometry(geom) : [];
        if (decoded.length >= 2) {
          for (const p of decoded) pushUnique(pts, p);
        } else {
          if (isFinitePoint(tl.from)) pushUnique(pts, tl.from);
          if (isFinitePoint(tl.to)) pushUnique(pts, tl.to);
        }
      }
      if (isFinitePoint(slot.coordinates)) pushUnique(pts, slot.coordinates);
    }
  }
  return pts;
}

/**
 * Async: for each drive leg, prefer existing ROUTE_API/CACHED polyline;
 * otherwise resolve via RouteGeometryService (real road network when available).
 * Optionally stamps `leg.geometry` so overlays can reuse the same polyline.
 */
export async function resolveDriveCorridorDenserCoordinates(opts: {
  plan: TripPlan;
  routeGeometry?: RouteGeometryResolver | null;
  /** Default true — fetch when preferred road polyline is missing. */
  fetchMissingRoutePolylines?: boolean;
  /** Default true — write resolved geometry onto TravelLeg.geometry. */
  stampGeometryOnLegs?: boolean;
}): Promise<DriveCorridorResolveResult> {
  const fetchMissing = opts.fetchMissingRoutePolylines !== false;
  const stamp = opts.stampGeometryOnLegs !== false;
  const denserCoordinates: DriveCorridorCoordinate[] = [];
  const legSources: DriveCorridorResolveResult['legSources'] = [];

  for (const day of opts.plan.days) {
    for (const slot of day.timeSlots) {
      const tl = slot.travelLegFromPrev;
      if (tl?.mode !== 'drive') {
        if (isFinitePoint(slot.coordinates)) {
          pushUnique(denserCoordinates, slot.coordinates);
        }
        continue;
      }

      let geometry = extractTravelLegGeometry(tl);
      let source: DriveCorridorLegSource = 'LEG_ENDPOINTS';
      let points: DriveCorridorCoordinate[] = [];

      if (geometry && geometryIsPreferredRoadNetwork(geometry)) {
        points = decodeTravelRouteGeometry(geometry);
        source = geometry.source as DriveCorridorLegSource;
      } else if (
        fetchMissing &&
        opts.routeGeometry &&
        isFinitePoint(tl.from) &&
        isFinitePoint(tl.to)
      ) {
        try {
          const resolved = await opts.routeGeometry.resolveGeometry({
            from: { lat: tl.from.lat, lng: tl.from.lng },
            to: { lat: tl.to.lat, lng: tl.to.lng },
            travelMode: 'DRIVING',
            useRouteApi: true,
            cachedPolyline:
              geometry?.encoding === 'ENCODED_POLYLINE' && geometry.value
                ? geometry.value
                : extractLooseEncodedPolyline(tl),
            cachedProvider: undefined,
          });
          if (resolved.polyline?.trim()) {
            const mapped = mapRouteGeometrySource(resolved.geometrySource);
            geometry = encodedPolylineToGeometry(resolved.polyline, mapped);
            points = decodeTravelRouteGeometry(geometry);
            source =
              mapped === 'NONE'
                ? 'STRAIGHT_LINE'
                : (mapped as DriveCorridorLegSource);
          }
        } catch {
          // fall through to endpoints / existing straight geometry
        }
      }

      if (points.length < 2 && geometry) {
        points = decodeTravelRouteGeometry(geometry);
        if (points.length >= 2) {
          source =
            geometry.source === 'ROUTE_API' ||
            geometry.source === 'CACHED_METADATA' ||
            geometry.source === 'STRAIGHT_LINE'
              ? geometry.source
              : 'STRAIGHT_LINE';
        }
      }

      if (points.length < 2) {
        points = [];
        if (isFinitePoint(tl.from)) points.push(tl.from);
        if (isFinitePoint(tl.to)) points.push(tl.to);
        source = 'LEG_ENDPOINTS';
      }

      if (stamp && geometry && points.length >= 2) {
        tl.geometry = geometry;
      }

      for (const p of points) pushUnique(denserCoordinates, p);
      legSources.push({
        slotId: slot.id,
        source,
        pointCount: points.length,
      });

      if (isFinitePoint(slot.coordinates)) {
        pushUnique(denserCoordinates, slot.coordinates);
      }
    }
  }

  return { denserCoordinates, legSources };
}
