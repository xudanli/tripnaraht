/** Planning-phase mobile read models (not execution presence). */

export type MobilePlanningMemberStyle =
  | 'complete'
  | 'attention'
  | 'pending'
  | 'invite';

export interface MobilePlanningTeamMemberDto {
  /** Stable member id — prefer tripCollaborator.id when available */
  id: string;
  name: string;
  role?: 'leader' | 'member' | string;
  /** One-line Chinese label ready for UI display */
  statusLabel: string;
  /** Preference completion 0.0–1.0 (placeholders may be 0) */
  progress: number;
  style: MobilePlanningMemberStyle;
  /** true = dashed avatar invite slot */
  isPlaceholder: boolean;
  focusAreas?: string[];
  pendingConfirmations?: string[];
  avatarUrl?: string | null;
  lastActiveAt?: string;
}

export interface MobilePlanningTeamStatusDto {
  /** Display headcount including invite placeholders */
  memberCount: number;
  /** Pending / unaccepted invite slots */
  invitePendingCount: number;
  members: MobilePlanningTeamMemberDto[];
}

/** Planning Tab「空间路线」— aligns with iOS SpatialRouteViewData + map. */
export type SpatialRoutePolylineStyle = 'confirmed' | 'candidate' | 'risk';
export type SpatialRouteMarkerType =
  | 'confirmedPOI'
  | 'candidatePOI'
  | 'riskPoint'
  | 'memberPreference';

export interface SpatialRouteDayMarkerDto {
  id: string;
  dayNumber: number;
  label: string;
  isConfirmed: boolean;
}

export interface SpatialRouteSelectedPoiDto {
  title: string;
  distanceFromDay: string;
  timeImpact: string;
  matchPercent: number;
  systemImage: string;
}

export interface SpatialRouteAiInsightDto {
  title: string;
  detail: string;
  suggestion: string;
}

export interface SpatialRouteWarningDto {
  label: string;
  roadName: string;
  status: string;
  riskLevel: string;
  impactRange: string;
  updatedAt: string;
}

export interface SpatialRouteLayerSummaryDto {
  confirmedRoutes: number;
  candidatePOIs: number;
  riskPoints: number;
  memberPreferences: number;
  routeElements: number;
  poiCount: number;
}

export interface SpatialRouteSearchResultDto {
  id: string;
  title: string;
  distanceInfo: string;
  timeImpact: string;
  matchPercent: number;
  systemImage: string;
}

export interface SpatialRouteImpactMetricDto {
  icon: string;
  label: string;
  value: string;
  tag: string;
}

export interface SpatialRouteInsertionOptionDto {
  id: string;
  title: string;
  detail: string;
  drivingImpact: string;
  isRecommended: boolean;
  isSelected: boolean;
}

export interface SpatialRouteCandidateDetailDto {
  title: string;
  region: string;
  distanceInfo: string;
  stayDuration: string;
  timeImpact: string;
  matchPercent: number;
  tags: string[];
  recommendReasons: string[];
  impactMetrics: SpatialRouteImpactMetricDto[];
  insertionOptions: SpatialRouteInsertionOptionDto[];
  aiRecommendation: string;
}

export interface SpatialRouteEvidenceItemDto {
  title: string;
  detail: string;
}

export interface SpatialRouteAiSuggestionDetailDto {
  alertMessage: string;
  alertNote: string;
  happened: string;
  affected: string;
  options: string;
  recommendation: string;
  currentDriving: string;
  currentDistance: string;
  currentIntensity: string;
  currentStatus: string;
  optimizedDriving: string;
  optimizedDistance: string;
  optimizedIntensity: string;
  optimizedStatus: string;
  optimizedSummary: string;
  evidenceItems: SpatialRouteEvidenceItemDto[];
}

export interface SpatialRouteMapPolylineDto {
  id: string;
  dayNumber: number;
  /** GeoJSON order: [lng, lat] */
  coordinates: Array<[number, number]>;
  style: SpatialRoutePolylineStyle;
}

export interface SpatialRouteMapMarkerDto {
  id: string;
  type: SpatialRouteMarkerType;
  lat: number;
  lng: number;
  label?: string;
}

export interface SpatialRouteRiskZoneDto {
  id: string;
  /** GeoJSON order: [lng, lat] */
  coordinates: Array<[number, number]>;
  level: string;
}

export interface SpatialRouteMapDto {
  polylines: SpatialRouteMapPolylineDto[];
  markers: SpatialRouteMapMarkerDto[];
  riskZones?: SpatialRouteRiskZoneDto[];
}

export interface MobileSpatialRouteDto {
  dayMarkers: SpatialRouteDayMarkerDto[];
  selectedPOI: SpatialRouteSelectedPoiDto;
  aiInsight: SpatialRouteAiInsightDto;
  routeWarning: SpatialRouteWarningDto;
  pageSubtitle: string;
  layerSummary: SpatialRouteLayerSummaryDto;
  searchResults: SpatialRouteSearchResultDto[];
  candidateDetail: SpatialRouteCandidateDetailDto;
  aiSuggestionDetail: SpatialRouteAiSuggestionDetailDto;
  map: SpatialRouteMapDto;
  /** Envelope helpers — also copied to response root by mobileSuccessResponse */
  contextVersion: number;
  planVersion?: number;
}

export interface MobileSpatialSearchDto {
  items: SpatialRouteSearchResultDto[];
  contextVersion: number;
  planVersion?: number;
}

export interface MobileSpatialCandidateDetailDto extends SpatialRouteCandidateDetailDto {
  poiId: string;
  placeId?: number;
  contextVersion: number;
  planVersion?: number;
}

export interface SpatialRouteRiskEvidenceDto {
  source: string;
  detail: string;
  updatedAt: string;
  sourceURL?: string;
}

export interface MobileSpatialRoadRisksDto {
  alertTitle: string;
  alertDetail: string;
  items: SpatialRouteWarningDto[];
  evidence: SpatialRouteRiskEvidenceDto[];
  contextVersion: number;
  planVersion?: number;
}

export interface MobileSpatialWriteResultDto {
  itineraryItemId?: string;
  placeId?: number;
  dayIndex: number;
  contextVersion: number;
  planVersion?: number;
  /** Hint for clients — re-fetch spatial-route */
  refreshSpatialRoute: true;
}

export interface InsertSpatialCandidateBodyDto {
  dayIndex: number;
  insertionOptionId: string;
  slotTime?: string;
}

export interface AddSpatialLocationBodyDto {
  placeId?: string | number;
  lat: number;
  lng: number;
  title: string;
  dayIndex: number;
}

/** 添加活动页「加入今天」 */
export interface AddPlanningActivityBodyDto {
  dayIndex: number;
  placeId?: number | string;
  attractionId?: string;
  title?: string;
  placeName?: string;
  note?: string;
  startTime?: string;
  endTime?: string;
}

/** Planning 「路线蓝图」— aligns with iOS RouteBlueprintData. */
export type RouteBlueprintDayStatus = 'completed' | 'current' | 'upcoming' | 'future';

export type RouteBlueprintConfirmationStatus =
  | 'CONFIRMED'
  | 'NEEDS_OPTIMIZATION'
  | 'PENDING';

export interface RouteBlueprintDayDto {
  id: string;
  dayNumber: number;
  label: string;
  subtitle: string;
  status: RouteBlueprintDayStatus;
  theme: string;
  coreAttractions: string[];
  accommodationCity?: string;
  confirmationStatus: RouteBlueprintConfirmationStatus;
  systemImage?: string;
}

export interface RouteBlueprintPaceDto {
  totalDrivingKm?: number;
  totalDrivingLabel: string;
  totalDrivingIntensity?: string;
  longestDayDrivingKm?: number;
  longestDayDrivingLabel: string;
  longestDayIndex?: number;
  accommodationChangeCount?: number;
  accommodationChangeLabel: string;
  accommodationChangeIntensity?: string;
  highIntensityDayCount?: number;
  highIntensityDayLabel: string;
  highIntensityDayIndexes: number[];
}

export interface MobileRouteBlueprintDto {
  title: string;
  summary: string;
  days: RouteBlueprintDayDto[];
  pace?: RouteBlueprintPaceDto;
  aiInsight?: string;
  aiInsightTargetDays?: number[];
  contextVersion: number;
  planVersion?: number;
}

/** Slim card for planning-overview embedding. */
export interface MobileRouteBlueprintOverviewSummaryDto {
  title: string;
  summary?: string;
  days: Array<{
    id: string;
    dayNumber: number;
    label: string;
    subtitle: string;
    status: RouteBlueprintDayStatus;
  }>;
}

export type DayThemeSource = 'user' | 'ai' | 'system';

export interface PatchDayThemeBodyDto {
  /** Required unless clearTheme; null clears theme */
  theme?: string | null;
  label?: string | null;
  /** Explicit clear when theme omitted */
  clearTheme?: boolean;
  source?: DayThemeSource;
}

export interface PatchDayThemesBodyDto {
  days: Array<{
    dayIndex: number;
    theme: string | null;
    label?: string | null;
  }>;
  source?: DayThemeSource;
}

export interface MobileDayThemeUpdateResultDto {
  dayIndex: number;
  theme: string | null;
  label?: string | null;
  updatedAt: string;
  contextVersion: number;
  planVersion?: number;
}

export interface MobileDayThemesBatchResultDto {
  days: Array<{
    dayIndex: number;
    theme: string | null;
    label?: string | null;
  }>;
  updatedAt: string;
  contextVersion: number;
  planVersion?: number;
}
