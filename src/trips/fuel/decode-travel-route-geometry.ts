/**
 * Decode TravelRouteGeometryV1 (or raw encoded polyline) → ordered {lat,lng}[].
 * Does not invent geometry — empty input yields [].
 */

import { decodePolyline } from '../../transport/utils/encoded-polyline.util';
import type { TravelRouteGeometryV1 } from '../../transport/contracts/travel-eta.contract';
import type { GeoPoint } from '../decision/world-model';

export function decodeTravelRouteGeometry(
  geometry: TravelRouteGeometryV1 | null | undefined,
): GeoPoint[] {
  if (!geometry || geometry.encoding === 'NONE' || !geometry.value?.trim()) {
    return [];
  }
  if (geometry.encoding === 'ENCODED_POLYLINE') {
    return decodePolyline(geometry.value.trim()).filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );
  }
  if (geometry.encoding === 'GEOJSON_LINESTRING') {
    try {
      const parsed = JSON.parse(geometry.value) as {
        type?: string;
        coordinates?: number[][];
      };
      if (!Array.isArray(parsed.coordinates)) return [];
      return parsed.coordinates
        .map((c) => ({ lng: Number(c[0]), lat: Number(c[1]) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    } catch {
      return [];
    }
  }
  return [];
}

/** Map RouteGeometryService source → TravelRouteGeometryV1.source */
export function mapRouteGeometrySource(
  source: string | undefined,
): TravelRouteGeometryV1['source'] {
  if (source === 'route_api') return 'ROUTE_API';
  if (source === 'cached_metadata') return 'CACHED_METADATA';
  if (source === 'straight_line') return 'STRAIGHT_LINE';
  return 'NONE';
}

export function encodedPolylineToGeometry(
  polyline: string,
  source: TravelRouteGeometryV1['source'],
): TravelRouteGeometryV1 {
  const value = polyline.trim();
  const points = value ? decodePolyline(value) : [];
  return {
    encoding: 'ENCODED_POLYLINE',
    value,
    pointCount: points.length || undefined,
    source,
  };
}
