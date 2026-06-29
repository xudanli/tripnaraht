export type RouteGeometrySource = 'route_api' | 'straight_line' | 'cached_metadata';

export interface RouteGeometryResult {
  polyline: string;
  geometrySource: RouteGeometrySource;
  distanceMeters?: number;
  durationMinutes?: number;
}

export interface RouteGeometryInput {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  travelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT';
  /** Place / item metadata 中已缓存的 encoded polyline */
  cachedPolyline?: string;
  useRouteApi?: boolean;
}
