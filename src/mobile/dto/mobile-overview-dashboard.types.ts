/**
 * 执行总览 Dashboard — Mobile BFF 契约（新 IA 首屏投影）
 * @see src/trips/execution-overview-dashboard/OVERVIEW_DASHBOARD_API.md
 */

export const OVERVIEW_DASHBOARD_SCHEMA_ID =
  'tripnara.execution_overview_dashboard@v1' as const;

/** 综合执行状态（服务端裁定，仅 4 态） */
export type OverviewOverallStatusCode =
  | 'ON_PLAN'
  | 'NEEDS_ATTENTION'
  | 'SUGGEST_ADJUST'
  | 'PAUSE_EXECUTION';

/** 自驾生命周期（7 态） */
export type OverviewSelfDriveLifecycle =
  | 'NOT_DEPARTED'
  | 'PREPARING'
  | 'DRIVING'
  | 'TEMPORARY_STOP'
  | 'ARRIVED'
  | 'DAY_ENDED'
  | 'BLOCKED';

export type OverviewTimeMarginSeverity = 'OK' | 'TIGHT' | 'LATE';

export type OverviewCtaPhase =
  | 'NOT_DEPARTED'
  | 'DRIVING'
  | 'AT_DESTINATION'
  | 'ACTIVITY_ENDED';

export type OverviewDepartureKind =
  | 'CAN_DEPART_NOW'
  | 'DEPART_WITHIN'
  | 'CAN_LINGER'
  | 'DELAY_DEPART'
  | 'DO_NOT_DEPART'
  | 'CHANGE_ROUTE';

export type OverviewTeamReadinessKind = 'READY' | 'PARTIAL' | 'BLOCKED';

/** 当前所处（服务端裁定，避免客户端猜在店/在开） */
export type OverviewNowKind =
  | 'NOT_STARTED'
  | 'PREPARING'
  | 'DRIVING'
  | 'AT_STOP'
  | 'DAY_ENDED'
  | 'BLOCKED';

export type OverviewExceptionCode =
  | 'RISK'
  | 'BLOCKED'
  | 'NEEDS_ADJUSTMENT'
  | 'LATE';

export type OverviewRecommendedAdjustmentKind =
  | 'DELAY_DEPART'
  | 'CHANGE_STOP'
  | 'SHORTEN_STAY'
  | 'OPEN_ADJUSTMENT_QUEUE'
  | 'FOLLOW_RUNBOOK';

export interface OverviewOverallStatusDto {
  code: OverviewOverallStatusCode;
  headlineZh: string;
  detailZh?: string;
  primaryRiskId?: string;
  pendingAdjustmentCount?: number;
  /** 与 planReality.hasImpact 同源；无 Impact 时不为 true */
  hasImpact?: boolean;
}

/** 执行投影 · Now（当前态） */
export interface OverviewNowDto {
  kind: OverviewNowKind;
  activityId?: string;
  titleZh: string;
  detailZh?: string;
  /** true=已在目的地停留；false=在开/未出发等 */
  atDestination: boolean;
}

/** 执行投影 · 仅在有打扰价值时出现 */
export interface OverviewExceptionDto {
  code: OverviewExceptionCode;
  titleZh: string;
  detailZh?: string;
  primaryRiskId?: string;
}

/** 执行投影 · Plan / Reality / Impact（旅行中价值核心） */
export interface OverviewPlanRealityDto {
  plannedArrivalLocalHHmm?: string;
  /** 实际到达，或尚无实际时的 ETA */
  actualOrEtaLocalHHmm?: string;
  /** 来源：ACTUAL | ETA | PLANNED_ONLY */
  realitySource: 'ACTUAL' | 'ETA' | 'PLANNED_ONLY';
  /** 正=提前，负=迟到（分钟） */
  deviationMinutes?: number;
  deviationZh?: string;
  /** 服务端裁决：是否值得打扰用户 */
  hasImpact: boolean;
  impactReasonZh?: string;
  recommendedAdjustment?: {
    kind: OverviewRecommendedAdjustmentKind;
    titleZh: string;
    detailZh?: string;
  };
}

export interface OverviewSelfDriveDto {
  lifecycle: OverviewSelfDriveLifecycle;
  driver?: { memberId: string; displayName: string };
  continuousDriveMinutes?: number;
  todayDrivenMinutes?: number;
  todayRemainingDriveMinutes?: number;
  planBadgeZh?: string;
  nightEtaZh?: string;
  driverContextLineZh?: string;
  dailyDriveLineZh?: string;
  planContextLineZh?: string;
}

export interface OverviewNextDestinationDto {
  activityId?: string;
  titleZh: string;
  placeTypeZh?: string;
  timeWindowZh?: string;
  distanceKm?: number;
  driveMinutes?: number;
  distanceDurationZh?: string;
  etaZh?: string;
  timeMarginMinutes?: number;
  timeMarginZh?: string;
  timeMarginSeverity?: OverviewTimeMarginSeverity;
  accessNoteZh?: string;
  statusNoteZh?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  ctaPhase: OverviewCtaPhase;
}

export interface OverviewDepartureSuggestionDto {
  kind: OverviewDepartureKind;
  titleZh: string;
  detailZh?: string;
  /** 机器可读本地时刻 HH:mm */
  departBeforeLocalTime?: string;
}

export interface OverviewVehicleDto {
  isNormal: boolean;
  summaryLineZh: string;
  fuelPercent?: number;
  rangeKm?: number;
  nextFuelKm?: number;
  nextFuelLabelZh?: string;
  vehicleTypeZh?: string;
  roadFitZh?: string;
  alertTitleZh?: string;
  alertDetailZh?: string;
  continuousDriveWarningZh?: string;
  rentalEmergencyPhone?: string;
}

export interface OverviewTeamReadinessDto {
  kind: OverviewTeamReadinessKind;
  summaryLineZh: string;
  attentionLineZh?: string;
  readyCount: number;
  totalCount: number;
}

export interface OverviewAttentionDto {
  riskCount: number;
  pendingDecisionCount: number;
}

export interface OverviewLodgingDto {
  nameZh: string;
  detailZh: string;
  statusZh: string;
  imageUrl?: string;
}

export interface OverviewOfflineMapHintDto {
  available: boolean;
}

/**
 * 自驾统一建议（K4 shadow）— 与 Kernel DriveAdvisory 同构；
 * 前端不感知 ChinaAltitude / IcelandWind 等国家类型名。
 */
export type OverviewDriveAdvisoryType =
  | 'WEATHER'
  | 'ROAD_ACCESS'
  | 'VEHICLE_FIT'
  | 'ALTITUDE'
  | 'RESTRICTION'
  | 'FERRY'
  | 'CHECKPOINT'
  | 'FUEL'
  | 'FATIGUE'
  | 'SEASONAL'
  | 'OTHER';

export type OverviewDriveAdvisorySeverity = 'INFO' | 'WARNING' | 'BLOCK';

export interface OverviewDriveAdvisoryDto {
  type: OverviewDriveAdvisoryType;
  severity: OverviewDriveAdvisorySeverity;
  titleZh: string;
  summaryZh: string;
  affectedSegmentId?: string;
  validWindow?: { fromLocal?: string; toLocal?: string };
  recommendation?: { action: string; detailZh?: string };
}

/** Kernel 影子摘要（旧客户端可忽略） */
export interface OverviewSelfDriveKernelShadowDto {
  destinationPackId: string;
  countryCode: string;
  corridorId?: string | null;
  criticalSegmentCount: number;
  roadEvidenceFreshness?: string;
  roadStatus?: string;
  /** 是否允许用路况证据做强阻断 */
  roadStrongJudgmentAllowed?: boolean;
}

export interface OverviewDashboardDto {
  schemaId: typeof OVERVIEW_DASHBOARD_SCHEMA_ID;
  contextVersion: number;
  serverTime: string;
  /** lite=true 时部分重字段省略 */
  lite: boolean;
  trafficUpdatedAt?: string;
  offlineMapHint?: OverviewOfflineMapHintDto;
  overallStatus: OverviewOverallStatusDto;
  selfDrive: OverviewSelfDriveDto;
  nextDestination: OverviewNextDestinationDto;
  departureSuggestion?: OverviewDepartureSuggestionDto;
  vehicle: OverviewVehicleDto;
  teamReadiness: OverviewTeamReadinessDto;
  attention?: OverviewAttentionDto;
  lodging?: OverviewLodgingDto;
  /** 有活跃 Runbook 时仅带 id，详情另拉 */
  activeRunbookId?: string;
  /**
   * Execution Projection（P1）：显式 Now / Exception / Plan·Reality·Impact。
   * 旧客户端可忽略；新 Travel Mode 首屏优先读这三项 + nextDestination。
   */
  now?: OverviewNowDto;
  exception?: OverviewExceptionDto;
  planReality?: OverviewPlanRealityDto;
  /**
   * Self-Drive Kernel 影子投影（K4）。
   * 国家知识经 DriveAdvisory 灌入；不抬升 overallStatus（安静原则仍由 Impact 门禁）。
   */
  advisories?: OverviewDriveAdvisoryDto[];
  selfDriveKernel?: OverviewSelfDriveKernelShadowDto;
}

export const DRIVE_SESSION_SCHEMA_ID = 'tripnara.execution_drive_session@v1' as const;
export const OVERVIEW_VEHICLE_DETAIL_SCHEMA_ID =
  'tripnara.execution_overview_vehicle@v1' as const;

/** 持久化：Trip.metadata.mobileExecution.driveSession */
export interface StoredDriveSession {
  localDate: string;
  phase: OverviewSelfDriveLifecycle;
  /** 当前连续驾驶段起点（DRIVING 时有效） */
  continuousStartedAt?: string;
  /** 暂停前已累计连续分钟 */
  continuousAccumulatedMinutes?: number;
  /** 今日累计驾驶分钟（不含当前未结算段则由读时补算） */
  todayDrivenMinutes?: number;
  todayRemainingDriveMinutes?: number;
  lastDriverMemberId?: string;
  lastNavSessionId?: string;
  updatedAt: string;
}

export interface DriveSessionDto {
  schemaId: typeof DRIVE_SESSION_SCHEMA_ID;
  localDate: string;
  timezone: string;
  phase: OverviewSelfDriveLifecycle;
  continuousDriveMinutes: number;
  todayDrivenMinutes: number;
  todayRemainingDriveMinutes?: number;
  lastDriverMemberId?: string;
  continuousDriveWarningZh?: string;
  /** 服务端裁定时间 */
  serverTime: string;
  contextVersion: number;
  /** true=来自持久化 driveSession；false=由 nav/field/confirm 派生 */
  authoritative: boolean;
}

export interface OverviewVehicleForbiddenRoadDto {
  titleZh: string;
  detailZh?: string;
  severityZh?: string;
}

export interface OverviewVehicleFuelStationDto {
  nameZh: string;
  distanceKm?: number;
  distanceZh?: string;
  durationZh?: string;
  tagZh?: string;
}

export interface OverviewVehicleDetailDto {
  schemaId: typeof OVERVIEW_VEHICLE_DETAIL_SCHEMA_ID;
  contextVersion: number;
  serverTime: string;
  summary: OverviewVehicleDto;
  rentalEmergencyPhone?: string;
  vehicleTypeZh?: string;
  roadFitZh?: string;
  forbiddenRoads: OverviewVehicleForbiddenRoadDto[];
  fuelStations: OverviewVehicleFuelStationDto[];
  chargingStations: OverviewVehicleFuelStationDto[];
  continuousDriveWarningZh?: string;
}
