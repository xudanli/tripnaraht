/** 徒步路线详情 — GET /route-directions/:id 对徒步线自动附带 */

export type HikingDetailDaySkeleton = {
  day: number;
  theme: string;
  distanceKm: number;
  ascentM: number;
  descentM?: number;
  estimatedHours?: number;
};

export type HikingDetailSupplyPoi = {
  id: string;
  nameCN: string;
  nameEN: string;
  subCategory: string;
  lat: number;
  lng: number;
  role?: string;
  elevation_m?: number;
  capacity?: number;
  bookingRequired?: boolean;
  feeEstimate?: string;
};

export type HikingDetailElevationPoint = {
  distance: number;
  lat: number;
  lng: number;
  elevation: number;
  slope: number;
  cumulativeAscent: number;
};

export type HikingDetailTerrainSummary = {
  cumulativeAscentM: number;
  maxSlopePct: number;
  totalDistanceKm: number;
  effortScore: number;
  difficulty: string;
  dataSource: 'live_dem' | 'cached_fixture';
};

export type HikingDetailSummary = {
  totalDistanceKm: number;
  totalAscentM: number;
  totalDescentM?: number;
  suggestedDays: number;
  estimatedTimeMin?: number;
  maxElevationM: number;
  minElevationM?: number;
  difficulty: string;
  readinessScore?: number;
  loopType?: 'point_to_point' | 'loop' | 'out_and_back';
};

export type HikingDetailGeometry = {
  polyline: Array<{ lat: number; lng: number }>;
  startPoint?: { lat: number; lng: number; nameCN: string };
  endPoint?: { lat: number; lng: number; nameCN: string };
};

export type HikingDetailRiskMatrix = {
  weatherSensitivity: 'low' | 'medium' | 'high';
  exposureLevel: 'low' | 'medium' | 'high';
  riverCrossing: boolean;
  altitudeSickness: boolean;
  roadClosureRisk: boolean;
  signalBlackout: boolean;
  riskTags?: string[];
};

/** Admin override 风险矩阵表格行（优先用于「风险与约束」Tab 展示） */
export type HikingDetailRiskMatrixRow = {
  id: string;
  label?: string;
  labelCN?: string;
  value: string;
  level?: string;
  notes?: string;
};

export type HikingDetailHardGate = {
  id: string;
  category: 'wind' | 'precipitation' | 'temperature' | 'visibility' | 'other';
  titleZh: string;
  ruleZh: string;
  threshold?: string;
};

export type HikingTrailDetail = {
  summary: HikingDetailSummary;
  geometry: HikingDetailGeometry;
  daySkeleton: HikingDetailDaySkeleton[];
  elevationProfile: HikingDetailElevationPoint[];
  terrainSummary: HikingDetailTerrainSummary;
  supplyPois: HikingDetailSupplyPoi[];
  fitnessMatch?: {
    longestHike: number;
    maxDailyAscentM: number;
    /** 与 summary.suggestedDays、daySkeleton.length 一致 */
    suggestedDays: number;
    dayPaceVerdict: Array<{
      day: number;
      ascentM: number;
      eligible: boolean;
      /** pace_ok | pace_tight | pace_hard */
      verdict: string;
      noteZh: string;
    }>;
    eligible: boolean;
    /** 整体节奏结论（与 readiness 对齐） */
    fitnessVerdict?: 'pace_ok' | 'pace_tight' | 'pace_hard';
  };
  weatherRisk?: {
    level: 'low' | 'medium' | 'high';
    headlineZh: string;
    rules: string[];
  };
  segments?: Array<{
    index: number;
    nameZh: string;
    distanceKm: number;
    ascentM: number;
    maxSlopePct?: number;
    exposureLevel?: 'low' | 'medium' | 'high';
    estimatedHours?: number;
    keyNodes?: Array<{
      type: 'water' | 'river_crossing' | 'shelter' | 'viewpoint' | 'exit';
      nameZh: string;
      lat?: number;
      lng?: number;
      noteZh?: string;
    }>;
  }>;
  riskMatrix: HikingDetailRiskMatrix;
  /** 来自 metadata.hikingDetailOverride.riskMatrix（表格行） */
  riskMatrixRows?: HikingDetailRiskMatrixRow[];
  hardGates: HikingDetailHardGate[];
  emergency: {
    rescuePhone?: string;
    registrationPointZh?: string;
    nearestExitPoints?: Array<{
      nameZh: string;
      lat?: number;
      lng?: number;
      distanceKm?: number;
      noteZh?: string;
    }>;
  };
  access?: {
    driving?: {
      parkingNameZh: string;
      parkingLat?: number;
      parkingLng?: number;
      driveDurationMin?: number;
      driveDistanceKm?: number;
      noteZh?: string;
    };
    transit?: {
      scheduleZh: string;
      bookingUrl?: string;
      seasonNoteZh?: string;
    };
  };
  supplies?: {
    waterDensity?: 'low' | 'medium' | 'high';
    waterSources?: Array<{ nameZh: string; lat?: number; lng?: number; seasonal?: string }>;
    toilets?: Array<{ nameZh: string; lat?: number; lng?: number }>;
  };
  shelters?: Array<{
    id: string;
    nameCN: string;
    nameEN?: string;
    lat: number;
    lng: number;
    elevation_m?: number;
    capacity?: number;
    bookingRequired: boolean;
    bookingUrl?: string;
    feeZh?: string;
    openSeason?: string;
  }>;
  timeWindows?: {
    suggestedDepartTime?: string;
    lastReturnBusTime?: string;
    sunsetBufferMin?: number;
    daylightHoursNoteZh?: string;
  };
  /** 准备页 — 许可/登记（Laugavegur 等满配线有种子数据） */
  permits?: Array<{
    id: string;
    titleZh: string;
    /** 英文或通用展示名（prep.name） */
    name?: string;
    nameCN?: string;
    nameEN?: string;
    required: boolean;
    bookingUrl?: string;
    noteZh?: string;
  }>;
  /** 准备页 — 装备/行前清单模板 */
  checklistTemplates?: Array<{
    id: string;
    category: 'gear' | 'safety' | 'logistics' | 'permits';
    titleZh: string;
    items: Array<{ id: string; labelZh: string; required?: boolean }>;
  }>;
  /** 离线包提示（瓦片/GeoJSON，P2 可换真实 URL） */
  offlinePackHints?: {
    version?: string;
    sizeBytesEstimate?: number;
    geojsonAvailable?: boolean;
    tileManifestAvailable?: boolean;
    geojsonUrl?: string;
    tileManifestUrl?: string;
    noteZh?: string;
  };
  alternatives?: {
    planBRoutes: Array<{
      id: string;
      titleZh: string;
      summaryZh: string;
      distanceKm?: number;
      reasonZh?: string;
      routeDirectionName?: string;
    }>;
    exitPoints: Array<{
      id: string;
      nameZh: string;
      distanceAlongTrailKm: number;
      lat?: number;
      lng?: number;
      noteZh?: string;
    }>;
    repairHints: Array<{
      scenario: 'delay' | 'fatigue' | 'weather' | 'injury';
      titleZh: string;
      actionZh: string;
    }>;
  };
};

/** 发现页列表轻量字段 */
export type HikingListCardFields = {
  readinessScore?: number;
  totalDistanceKm?: number;
  totalAscentM?: number;
  elevationGainM?: number;
  estimatedDays?: number;
  center?: { lat: number; lng: number };
  startPoint?: { lat: number; lng: number };
  /** 列表卡片起点文案（前端若期望 string 可用此字段） */
  startPointLabel?: string;
};
