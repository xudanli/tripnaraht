export type RouteGeometrySource = 'route_api' | 'straight_line' | 'cached_metadata';

export type RouteGeometryProvider = 'GOOGLE' | 'AMAP' | 'MAPBOX' | 'HEURISTIC' | 'UNKNOWN';

export interface RouteGeometryResult {
  polyline: string;
  geometrySource: RouteGeometrySource;
  distanceMeters?: number;
  durationMinutes?: number;
  /** Which Directions backend produced route_api geometry */
  provider?: RouteGeometryProvider;
  cacheHit?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  providerRequestId?: string;
}

export interface RouteGeometryInput {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  travelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT';
  /** Place / item metadata 中已缓存的 encoded polyline */
  cachedPolyline?: string;
  /** When known, stamp provider on cached_metadata (closes UNKNOWN) */
  cachedProvider?: RouteGeometryProvider;
  useRouteApi?: boolean;
}
