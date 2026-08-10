/**
 * 今日自驾状态 / 确认 — Mobile BFF 契约类型
 * @see src/trips/daily-drive/DAILY_DRIVE_STATUS_API.md
 */

export const DAILY_DRIVE_STATUS_SCHEMA_ID = 'tripnara.daily_drive_status@v1' as const;
export const DAILY_DRIVE_CONFIRM_SCHEMA_ID = 'tripnara.daily_drive_confirm@v1' as const;

export type DailyDriveGate = 'CAN_DEPART' | 'NEEDS_ATTENTION' | 'BLOCKED';

export type DailyDriveDimensionCode =
  | 'ROAD'
  | 'WEATHER'
  | 'DAYLIGHT'
  | 'FUEL'
  | 'SCHEDULE';

export type DailyDriveDimensionStatus = 'OK' | 'ATTENTION' | 'BLOCKED';

export type DailyDriveReminderLevel = 'MEDIUM' | 'LOW';

export type DailyDriveFuelLevel = 'FULL' | 'THREE_QUARTERS' | 'HALF' | 'QUARTER';

export type DailyDriveFatigue = 'GOOD' | 'FAIR' | 'FATIGUED';

export interface DailyDriveConfirmPayload {
  fuelLevel: DailyDriveFuelLevel;
  departOnPlan: boolean;
  driverMemberId: string;
  fatigue: DailyDriveFatigue;
  vehicleAbnormal: boolean;
  prepCompleted: boolean;
  vehicleNoteZh?: string;
  prepNoteZh?: string;
}

export interface DailyDriveDimensionDto {
  code: DailyDriveDimensionCode;
  labelZh: string;
  status: DailyDriveDimensionStatus;
  statusLabelZh: string;
  detailZh: string;
  relatedReminderIds?: string[];
}

export interface DailyDriveReminderItemDto {
  id: string;
  titleZh: string;
  detailZh: string;
  level: DailyDriveReminderLevel;
  levelLabelZh: string;
  iconHint?: string;
  relatedRiskId?: string;
  dimensionCode?: DailyDriveDimensionCode;
}

export interface DailyDriveStatusDto {
  schemaId: typeof DAILY_DRIVE_STATUS_SCHEMA_ID;
  localDate: string;
  timezone: string;
  gate: DailyDriveGate;
  gateLabelZh: string;
  headline: string;
  suggestedDepartBeforeLabelZh?: string;
  estimatedDelayLabelZh?: string;
  suggestedDepartBeforeAt?: string;
  estimatedDelayMinutesMin?: number;
  estimatedDelayMinutesMax?: number;
  confirmation: {
    isConfirmed: boolean;
    confirmedAt?: string;
    confirmedByMemberId?: string;
  };
  dimensions: DailyDriveDimensionDto[];
  reminders: {
    items: DailyDriveReminderItemDto[];
    naraSuggestionZh?: string;
  };
  entry?: {
    subtitleZh?: string;
  };
  evidence?: {
    updatedAt?: string;
    confidence?: number;
    /** alerts 超时未纳入时为 true；客户端可后台再拉 */
    remindersDeferred?: boolean;
  };
  contextVersion?: number;
}

export interface DailyDriveDriverOptionDto {
  memberId: string;
  displayName: string;
  avatarUrl?: string | null;
  isPrimaryDriver?: boolean;
}

export interface DailyDriveConfirmDraftDto {
  schemaId: typeof DAILY_DRIVE_CONFIRM_SCHEMA_ID;
  localDate: string;
  timezone: string;
  isConfirmed: boolean;
  lastSubmission?: DailyDriveConfirmPayload;
  defaults: DailyDriveConfirmPayload;
  driverOptions: DailyDriveDriverOptionDto[];
  contextVersion?: number;
}

export interface DailyDriveConfirmSubmitResponseDto {
  confirmationId: string;
  localDate: string;
  isConfirmed: true;
  confirmedAt: string;
  contextVersion: number;
  replay?: boolean;
  status?: DailyDriveStatusDto;
}

/** Trip.metadata.mobileExecution.dailyDrive 持久化形状 */
export interface DailyDriveStoredConfirmation {
  confirmationId: string;
  confirmedAt: string;
  confirmedByMemberId: string;
  payload: DailyDriveConfirmPayload;
  /** 同日 Idempotency-Key → 序列化提交响应 */
  idempotencyResults?: Record<string, string>;
}

export interface DailyDriveMetadata {
  byLocalDate?: Record<string, DailyDriveStoredConfirmation>;
}

export const DAILY_DRIVE_DIMENSION_ORDER: DailyDriveDimensionCode[] = [
  'ROAD',
  'WEATHER',
  'DAYLIGHT',
  'FUEL',
  'SCHEDULE',
];

export const DAILY_DRIVE_DIMENSION_LABELS: Record<DailyDriveDimensionCode, string> = {
  ROAD: '路况',
  WEATHER: '天气',
  DAYLIGHT: '日照',
  FUEL: '燃油',
  SCHEDULE: '日程',
};

export const FUEL_LEVEL_LABELS_ZH: Record<DailyDriveFuelLevel, string> = {
  FULL: '满',
  THREE_QUARTERS: '3/4',
  HALF: '1/2',
  QUARTER: '1/4',
};

export const FUEL_LEVELS: DailyDriveFuelLevel[] = [
  'FULL',
  'THREE_QUARTERS',
  'HALF',
  'QUARTER',
];

export const FATIGUE_LEVELS: DailyDriveFatigue[] = ['GOOD', 'FAIR', 'FATIGUED'];

/** 五维详情页 severity（比摘要多 CAUTION） */
export type DailyDriveDetailSeverity = 'OK' | 'ATTENTION' | 'CAUTION' | 'BLOCKED';

export const DAILY_DRIVE_DIMENSION_SCHEMA_IDS = {
  ROAD: 'tripnara.daily_drive_dimension_road@v1',
  WEATHER: 'tripnara.daily_drive_dimension_weather@v1',
  DAYLIGHT: 'tripnara.daily_drive_dimension_daylight@v1',
  FUEL: 'tripnara.daily_drive_dimension_fuel@v1',
  SCHEDULE: 'tripnara.daily_drive_dimension_schedule@v1',
} as const;

export type DailyDrivePrimaryAction =
  | 'OPEN_MAP'
  | 'ENABLE_WEATHER_REMINDERS'
  | 'VIEW_TIME_IMPACT'
  | 'ADJUST_TODAY'
  | 'NAVIGATE_FUEL'
  | 'UPDATE_FUEL_LEVEL';

export interface DailyDriveDetailShell {
  schemaId: string;
  localDate: string;
  timezone: string;
  contextVersion?: number;
  context: { tripLabelZh: string; dayLabelZh: string };
  hero: {
    titleZh: string;
    detailZh: string;
    metaZh?: string;
    severity: DailyDriveDetailSeverity;
    iconHint?: string;
  };
  primaryAction?: { labelZh: string; action: DailyDrivePrimaryAction };
}

export interface DailyDriveRoadStatRow {
  id: 'TOTAL_KM' | 'PROGRESS_KM' | 'ARRIVAL_WINDOW';
  labelZh: string;
  valueZh: string;
}

export interface DailyDriveRoadSegmentRow {
  titleZh: string;
  statusZh: string;
  severity: DailyDriveDetailSeverity;
}

export interface DailyDriveRoadParkingSpot {
  id?: string;
  role: 'NEXT' | 'ALTERNATE';
  roleZh: string;
  nameZh: string;
  distanceKm: number;
  distanceZh: string;
  durationZh?: string;
  detailZh?: string;
  lat?: number;
  lng?: number;
}

export interface DailyDriveRoadDetailDto extends DailyDriveDetailShell {
  schemaId: typeof DAILY_DRIVE_DIMENSION_SCHEMA_IDS.ROAD;
  /** 如 "1号公路为主，含少量碎石路" */
  routeSummaryZh?: string;
  /** 预计下一次明显路况变化（分钟） */
  nextChangeInMin?: number;
  nextChangeLabelZh?: string;
  routeNodesZh: string[];
  stats: DailyDriveRoadStatRow[];
  segments: DailyDriveRoadSegmentRow[];
  riskNotesZh: string[];
  parkingSpots: DailyDriveRoadParkingSpot[];
  /** 页脚政策：系统仅在封路或不安全条件出现时触发 Runbook */
  changeNoteZh?: string;
}

export interface DailyDriveWeatherMetricRow {
  id: 'TEMP' | 'WIND' | 'VISIBILITY' | 'SNOWFALL';
  labelZh: string;
  valueZh: string;
  iconHint?: string;
}

export interface DailyDriveWeatherTrendRow {
  timeZh: string;
  labelZh: string;
  iconHint?: string;
}

export interface DailyDriveWeatherImpactRow {
  id: 'CROSSWIND' | 'ICING' | 'VISIBILITY' | string;
  titleZh: string;
  /** 轻微影响 / 注意 / 正常 */
  statusZh: string;
  detailZh?: string;
  severity: DailyDriveDetailSeverity;
}

export interface DailyDriveWeatherDetailDto extends DailyDriveDetailShell {
  schemaId: typeof DAILY_DRIVE_DIMENSION_SCHEMA_IDS.WEATHER;
  /** 如 "-2°C · 阵风 6-10 m/s · 能见度良好" */
  summaryLineZh?: string;
  /** 如 "当前主要影响：局部侧风与低温" */
  mainImpactZh?: string;
  metrics: DailyDriveWeatherMetricRow[];
  trends: DailyDriveWeatherTrendRow[];
  impacts: DailyDriveWeatherImpactRow[];
  suggestionsZh: string[];
  reminderSettings: Array<{
    id: 'wind' | 'snowfall' | 'visibility' | string;
    labelZh: string;
    enabled: boolean;
  }>;
}

export type DailyDriveDaylightMarkerKind =
  | 'dawn'
  | 'suggested_depart'
  | 'sunrise'
  | 'now'
  | 'sunset'
  | 'arrival'
  | 'night'
  | 'daylight';

export type DailyDriveItineraryDaylightStatus =
  | 'AMPLE'
  | 'OK'
  | 'AFTER_SUNSET'
  | 'NIGHT';

export interface DailyDriveDaylightTimelineMarker {
  timeZh: string;
  labelZh: string;
  kind: DailyDriveDaylightMarkerKind | string;
}

export interface DailyDriveDaylightBand {
  id: 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';
  labelZh: string;
  startZh: string;
  endZh: string;
}

export interface DailyDriveDaylightItineraryLink {
  timeZh: string;
  titleZh: string;
  noteZh?: string;
  daylightStatus: DailyDriveItineraryDaylightStatus;
  daylightStatusZh: string;
}

export interface DailyDriveDaylightDetailDto extends DailyDriveDetailShell {
  schemaId: typeof DAILY_DRIVE_DIMENSION_SCHEMA_IDS.DAYLIGHT;
  sunriseLabelZh: string;
  sunsetLabelZh: string;
  /** 如 "黎明 06:00" */
  dawnLabelZh?: string;
  duskLabelZh?: string;
  suggestedDepartBeforeZh?: string;
  estimatedArrivalZh?: string;
  nightDriveMinutes?: number;
  timelineMarkers: DailyDriveDaylightTimelineMarker[];
  /** 色带：黎明/白天/黄昏/夜晚，供进度条着色 */
  daylightBands: DailyDriveDaylightBand[];
  itineraryLinks: DailyDriveDaylightItineraryLink[];
  nightExposure: {
    durationZh: string;
    durationMin?: number;
    segmentZh: string;
    severity: DailyDriveDetailSeverity;
    severityZh?: string;
  };
  suggestionsZh: string[];
  robustPlan: { detailZh: string; actionZh: string };
}

export interface DailyDriveFuelCoverageRow {
  id: 'TODAY_REMAINING' | 'TOMORROW_MORNING' | 'REMOTE_REDUNDANCY';
  labelZh: string;
  /** 如 "134 km" / "1.8x" */
  valueZh: string;
  /** 足够 / 安全 / 紧张 / 不足 */
  statusZh: string;
  status: 'OK' | 'ATTENTION' | 'BLOCKED';
}

export interface DailyDriveFuelStationRow {
  id: string;
  nameZh: string;
  /** 推荐 / 可靠 / 备选 */
  tagZh: string;
  tag: 'RECOMMENDED' | 'RELIABLE' | 'ALTERNATE';
  distanceKm: number;
  durationZh: string;
  /** 如 "€2.19/L" */
  priceLabelZh?: string;
  /** 兼容旧客户端：距离 · 时长 · 价格拼一行 */
  detailZh?: string;
  lat?: number;
  lng?: number;
}

export interface DailyDriveFuelDetailDto extends DailyDriveDetailShell {
  schemaId: typeof DAILY_DRIVE_DIMENSION_SCHEMA_IDS.FUEL;
  /** 0–1，圆环用 */
  fuelFraction: number;
  fuelLevelLabelZh: string;
  /** 预计还可行驶公里数 */
  rangeKm: number;
  rangeLabelZh: string;
  nextStationKm: number;
  nextStationLabelZh: string;
  /** 燃油覆盖评估（今日剩余 / 明日早段 / 偏远冗余） */
  coverage: DailyDriveFuelCoverageRow[];
  /** 推荐补给点（有序：推荐 → 可靠 → 备选） */
  stations: DailyDriveFuelStationRow[];
  ifNoRefuelZh?: string;
  suggestionZh?: string;
  selectedFuelLevel?: DailyDriveFuelLevel;
}

export interface DailyDriveScheduleTimelineItem {
  timeZh: string;
  titleZh: string;
  status: 'done' | 'current' | 'upcoming' | 'risk' | 'delayed' | 'hard_window';
  /** 已完成 / 进行中 / 待进行 / 硬时间窗 / … */
  statusZh?: string;
  isHardWindow?: boolean;
}

export interface DailyDriveScheduleBufferRow {
  id: 'OVERALL' | 'TO_NEXT' | 'TO_CHECKIN';
  labelZh: string;
  valueZh: string;
  /** 整体缓冲可用绿强调 */
  tone?: 'OK' | 'ATTENTION' | 'NEUTRAL';
}

export interface DailyDriveScheduleImpactRow {
  id: 'DRIVE_DELAY' | 'DAYLIGHT' | 'EXECUTABLE' | string;
  titleZh: string;
  detailZh: string;
  status?: 'OK' | 'ATTENTION' | 'BLOCKED';
  statusZh?: string;
}

export interface DailyDriveScheduleKeyNode {
  id: 'NEXT_HARD_WINDOW' | 'HOTEL_CHECKIN' | 'SELF_CHECKIN';
  labelZh: string;
  valueZh: string;
  tone?: 'OK' | 'ATTENTION' | 'NEUTRAL';
}

export interface DailyDriveScheduleDetailDto extends DailyDriveDetailShell {
  schemaId: typeof DAILY_DRIVE_DIMENSION_SCHEMA_IDS.SCHEDULE;
  /** 如 "16:20-16:40"；与 hero.detailZh 对齐 */
  arrivalWindowZh?: string;
  timeline: DailyDriveScheduleTimelineItem[];
  buffers: DailyDriveScheduleBufferRow[];
  impacts: DailyDriveScheduleImpactRow[];
  naraSuggestionZh?: string;
  keyNodes: DailyDriveScheduleKeyNode[];
}

export type DailyDriveDimensionDetailDto =
  | DailyDriveRoadDetailDto
  | DailyDriveWeatherDetailDto
  | DailyDriveDaylightDetailDto
  | DailyDriveFuelDetailDto
  | DailyDriveScheduleDetailDto;
