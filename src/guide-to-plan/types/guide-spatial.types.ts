/** 攻略地点空间解析状态（对齐产品 POI → 路网管线） */
export const GUIDE_GEO_RESOLUTION_STATUS = {
  EXTRACTED: 'extracted',
  MATCHED: 'matched',
  AMBIGUOUS: 'ambiguous',
  UNMATCHED: 'unmatched',
  GEO_RESOLVED: 'geo_resolved',
  ROUTABLE: 'routable',
} as const;

export type GuideGeoResolutionStatus =
  (typeof GUIDE_GEO_RESOLUTION_STATUS)[keyof typeof GUIDE_GEO_RESOLUTION_STATUS];

export interface GuideGeoPoint {
  lat: number;
  lng: number;
}

/** 攻略候选绑定的 TripNARA POI 实体（经纬度是 POI 属性，不替代 POI ID） */
export interface ResolvedGuidePoi {
  placeId: number;
  placeUuid?: string;
  sourceText: string;
  matchedName: string;
  matchedNameEn?: string | null;
  latitude: number;
  longitude: number;
  /** 路径规划用点（MVP 同 centroid；后续可接 parking/navigationPoint） */
  navigationPoint: GuideGeoPoint;
  countryCode?: string;
  poiType?: string;
  matchConfidence: number;
  geoResolutionStatus: GuideGeoResolutionStatus;
}

export interface GuideRouteRequest {
  from: GuideGeoPoint & { placeId?: number };
  to: GuideGeoPoint & { placeId?: number };
  mode: 'DRIVING' | 'WALKING' | 'TRANSIT';
  countryCode?: string;
}

export interface GuideRouteResult {
  distanceMeters: number;
  durationMinutes: number;
  travelMode: 'DRIVING' | 'WALKING' | 'TRANSIT';
  /** road_network = 路网 API；heuristic = 启发式降级 */
  source: 'road_network' | 'heuristic';
  availability?: GuideRouteAvailability;
}

/** 路由四层可用性（Exists → Legally Allowed → Operationally Available → Recommended） */
export interface GuideRouteAvailability {
  routeExists: boolean;
  legallyAllowed: boolean;
  operationallyAvailable: boolean;
  recommended: boolean;
  level:
    | 'route_recommended'
    | 'route_operationally_available'
    | 'route_legally_allowed'
    | 'route_exists'
    | 'route_blocked';
  warnings: string[];
  blockedReasons: string[];
}

export interface GuideRouteMatrixPoint {
  id: string;
  placeId?: number;
  lat: number;
  lng: number;
}

export interface GuideRouteMatrixResult {
  pointIds: string[];
  /** minutes[i][j] */
  minutes: number[][];
  /** 每段来源 */
  sources: Array<Array<'road_network' | 'heuristic' | 'self'>>;
}
