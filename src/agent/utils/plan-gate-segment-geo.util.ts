import type { RouteSegment } from '../../trips/decision/shared/world-model.types';

export interface LatLng {
  lat: number;
  lng: number;
}

export function extractRoutePointsFromSegment(segment: RouteSegment): LatLng[] {
  const points: LatLng[] = [];
  const metadata = segment.metadata ?? {};

  const acc = metadata.accommodation as { coordinates?: LatLng } | undefined;
  if (acc?.coordinates?.lat != null && acc?.coordinates?.lng != null) {
    points.push(acc.coordinates);
  }

  const restaurants = metadata.restaurants;
  if (Array.isArray(restaurants)) {
    for (const entry of restaurants) {
      const coords = (entry as { poi?: { coordinates?: LatLng } }).poi?.coordinates;
      if (coords?.lat != null && coords?.lng != null) points.push(coords);
    }
  }

  const attractions = metadata.attractions;
  if (Array.isArray(attractions)) {
    for (const entry of attractions) {
      const coords = (entry as { coordinates?: LatLng }).coordinates;
      if (coords?.lat != null && coords?.lng != null) points.push(coords);
    }
  }

  const encoded = metadata.route_encoded_polyline as string | undefined;
  if (encoded && points.length === 0) {
    // polyline decode omitted — frontend may decode; keep center fallback below
  }

  return dedupePoints(points);
}

function dedupePoints(points: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  for (const p of points) {
    const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    if (!out.some((x) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}` === key)) {
      out.push(p);
    }
  }
  return out;
}

export function toGeoJsonCoordinates(points: LatLng[]): [number, number][] {
  return points.map((p) => [p.lng, p.lat]);
}

export function segmentDay(segment: RouteSegment): number | undefined {
  return segment.metadata?.day as number | undefined;
}

export function segmentLabel(segment: RouteSegment): string {
  const meta = segment.metadata ?? {};
  return (
    (meta.name as string | undefined) ??
    (meta.theme as string | undefined) ??
    segment.segmentId
  );
}
