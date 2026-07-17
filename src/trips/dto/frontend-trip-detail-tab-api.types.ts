/**
 * 行程详情 Tab · 前端 TypeScript 类型
 *
 * 覆盖：文件 Tab / 时间轴 timeline-overview / 成员 collab-overview
 * 前端可复制到 `src/api/trip-detail-tab.types.ts` 或 monorepo shared package
 *
 * @see TRIP_FILES_API.md
 * @see TIMELINE_OVERVIEW_API.md
 * @see COLLAB_OVERVIEW_API.md
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Files Tab — GET/POST /trips/:tripId/files
// ---------------------------------------------------------------------------

export type TripFileCategoryId =
  | 'booking'
  | 'travel'
  | 'insurance'
  | 'receipts'
  | 'visa'
  | 'team';

export type TripFileStatus = 'UPLOADED' | 'PENDING' | 'EXPIRED';

export interface TripFileItem {
  id: string;
  tripId: string;
  category: TripFileCategoryId | string;
  status: TripFileStatus | string;
  fileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number;
  title: string | null;
  description: string | null;
  expiresAt: string | null;
  itineraryItemId: string | null;
  uploadedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripFileListQuery {
  category?: TripFileCategoryId | string;
  status?: TripFileStatus | string;
  limit?: number;
  offset?: number;
}

export interface TripFileListResponse {
  items: TripFileItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface TripFileCategoryStats {
  id: TripFileCategoryId | string;
  title: string;
  description: string;
  count: number;
}

export interface TripFileStatsResponse {
  totalCount: number;
  uploadedCount: number;
  pendingCount: number;
  expiringSoonCount: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  categories: TripFileCategoryStats[];
}

export interface TripFileDownloadResponse {
  fileId: string;
  fileName: string;
  mimeType: string | null;
  downloadUrl: string;
  expiresAt: string;
}

export interface CreateTripFilePendingInput {
  category: TripFileCategoryId | string;
  title?: string;
  description?: string;
  expiresAt?: string;
  itineraryItemId?: string;
}

export interface UploadTripFileInput extends CreateTripFilePendingInput {
  file: File | Blob;
}

export type TripFileOverviewSource =
  | 'trip_file'
  | 'itinerary_booking'
  | 'itinerary_link'
  | 'itinerary_pending';

export type TripFileOverviewStatus =
  | 'UPLOADED'
  | 'PENDING'
  | 'EXPIRED'
  | 'REFERENCE'
  | 'LINK';

export interface TripFileOverviewItem {
  id: string;
  source: TripFileOverviewSource;
  category: TripFileCategoryId | string;
  status: TripFileOverviewStatus | string;
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number;
  description?: string | null;
  expiresAt?: string | null;
  itineraryItemId?: string | null;
  tripDayId?: string | null;
  tripDayDate?: string | null;
  itemType?: string | null;
  placeName?: string | null;
  bookingStatus?: string | null;
  bookingConfirmation?: string | null;
  downloadUrl?: string | null;
  uploadedByUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  linkedTripFileIds?: string[];
}

export interface TripFileOverviewSources {
  tripFileCount: number;
  itineraryDocumentCount: number;
  itineraryPendingCount: number;
  itineraryLinkCount: number;
}

export interface TripFileOverviewQuery {
  category?: TripFileCategoryId | string;
  status?: TripFileOverviewStatus | string;
  source?: TripFileOverviewSource | string;
  limit?: number;
  offset?: number;
  includePending?: boolean;
}

export interface TripFileOverviewResponse {
  tripId: string;
  stats: TripFileStatsResponse;
  items: TripFileOverviewItem[];
  total: number;
  limit: number;
  offset: number;
  sources: TripFileOverviewSources;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Accommodation Tab — GET /trips/:tripId/accommodation-overview
// ---------------------------------------------------------------------------

export type AccommodationOverviewInclude =
  | 'stats'
  | 'nights'
  | 'reminders'
  | 'travel'
  | 'files';

export interface AccommodationOverviewQuery {
  include?: AccommodationOverviewInclude | AccommodationOverviewInclude[] | string;
}

export interface AccommodationCrossDayInfo {
  isCrossDay: boolean;
  crossDays: number;
  isCheckoutItem: boolean;
  displayMode: 'checkin' | 'checkout' | 'normal';
  timeLabels: { start: string; end: string };
}

export interface AccommodationPlaceSummary {
  nameCN?: string | null;
  nameEN?: string | null;
  category?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  imageUrl?: string | null;
  tags?: string[];
  rating?: number | null;
  coordinates?: { lat: number; lng: number } | null;
}

export interface AccommodationBooking {
  status?: string | null;
  confirmation?: string | null;
  url?: string | null;
  bookedAt?: string | null;
}

export interface AccommodationBookingDocument {
  id: string;
  name: string;
  url?: string;
  mimeType?: string;
  source?: 'note' | 'trip_file' | 'confirmation';
}

export interface AccommodationAlternative {
  id: string;
  name: string;
  placeId?: number | null;
  priceHint?: string | null;
  url?: string | null;
}

export interface AccommodationTravelTo {
  durationMinutes?: number | null;
  distanceMeters?: number | null;
  travelMode?: string | null;
  fromLabel: string;
  isLongSegment: boolean;
}

export interface AccommodationNightCard {
  id: string;
  tripDayId: string;
  date: string;
  dayNumber: number;
  displayMode: 'checkin' | 'checkout' | 'normal';
  name: string;
  placeId?: number | null;
  place?: AccommodationPlaceSummary;
  booking: AccommodationBooking;
  roomType?: string | null;
  roomCount?: number | null;
  crossDayInfo: AccommodationCrossDayInfo;
  alternatives?: AccommodationAlternative[];
  bookingDocuments: AccommodationBookingDocument[];
  linkedTripFileIds: string[];
  travelToAccommodation?: AccommodationTravelTo;
  estimatedCost?: number | null;
  currency?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface AccommodationOverviewStats {
  totalNights: number;
  bookedCount: number;
  needBookingCount: number;
  missingDocumentCount: number;
  checkoutDaysCount: number;
}

export interface AccommodationReminder {
  type: 'need_booking' | 'missing_document' | 'long_travel' | 'checkout';
  severity: 'info' | 'warning';
  itineraryItemId: string;
  tripDayId: string;
  date: string;
  title: string;
  message: string;
}

export interface AccommodationTravelSummary {
  totalDistance: number;
  totalDuration: number;
  longSegmentCount: number;
}

export interface AccommodationOverviewResponse {
  tripId: string;
  stats: AccommodationOverviewStats;
  nights: AccommodationNightCard[];
  reminders: AccommodationReminder[];
  travelSummary?: AccommodationTravelSummary;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Activities Tab — GET/POST /trips/:tripId/activity-favorites
// ---------------------------------------------------------------------------

export interface ActivityFavoriteItem {
  targetKey: string;
  itineraryItemId?: string | null;
  placeId?: number | null;
  favoritedAt: string;
}

export interface ActivityFavoritesListResponse {
  tripId: string;
  userId: string;
  favorites: ActivityFavoriteItem[];
  itineraryItemIds: string[];
  placeIds: number[];
  total: number;
}

export interface SetActivityFavoriteInput {
  itineraryItemId?: string;
  placeId?: number;
  favorited: boolean;
}

export interface SetActivityFavoriteResponse extends ActivityFavoritesListResponse {
  favorited: boolean;
  targetKey: string;
  itineraryItemId?: string | null;
  placeId?: number | null;
}

// ---------------------------------------------------------------------------
// Timeline Tab — GET /trips/:tripId/timeline-overview
// ---------------------------------------------------------------------------

export type TimelineOverviewInclude =
  | 'stats'
  | 'pipeline'
  | 'tasks'
  | 'reminders'
  | 'health'
  | 'suggestions'
  | 'planobjects'
  | 'readiness';

export type TimelineConflictCountSource = 'ssot_planning_conflicts' | 'schedule_conflicts';

export interface TimelineOverviewStats {
  feasibilityScore: number;
  paceScore: number;
  conflictCount: number;
  conflictCountSource: TimelineConflictCountSource;
  pendingConfirmationCount: number;
  filesPendingCount?: number;
  newSuggestionCount: number;
}

export type PipelineStageStatus = 'completed' | 'in-progress' | 'pending' | 'risk';

export interface PipelineStage {
  id: string;
  name: string;
  status: PipelineStageStatus;
  completedAt?: string;
  summary?: string;
}

export interface TimelineOverviewPlanning {
  /** @deprecated 主分数请用 overallReadiness.score；本字段为 pipeline 内部进度 */
  progressPercent: number;
  completedStages: number;
  totalStages: number;
  currentStageName?: string;
  stages: PipelineStage[];
}

export type OverallReadinessState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'NEAR_READY'
  | 'READY'
  | 'BLOCKED'
  | 'NEEDS_REVALIDATION';

export type ReadinessDimensionCode =
  | 'ROUTE'
  | 'ACCOMMODATION'
  | 'TRANSPORT'
  | 'ACTIVITY'
  | 'MEMBER';

/** 整体准备度首页卡片 — timeline-overview.overallReadiness */
export interface TimelineOverviewReadinessCard {
  score: number;
  state: OverallReadinessState;
  /** 细粒度：接近就绪 / 准备中 … */
  stateLabelZh: string;
  /** 首页主词：尚未就绪 / 已准备好 / 已阻塞 / 需要重新验证 */
  displayLabelZh: string;
  /** 如「整体准备度 78% · 尚未就绪」 */
  headline: string;
  evidenceConfidence: number;
  blockerCount: number;
  pendingConfirmationCount: number;
  whyNotReady?: string;
  potentialScoreLift?: number;
  dimensions: Array<{
    code: ReadinessDimensionCode;
    labelZh: string;
    score: number;
  }>;
  topPriority?: {
    title: string;
    actionCode?: string;
    estimatedScoreLift?: number;
  };
  reportDeepLink: string;
}

/** GET /trips/:id/overall-readiness 完整报告（子集字段 FE 够用即可） */
export interface OverallTripReadinessReport {
  tripId: string;
  score: number;
  state: OverallReadinessState;
  stateLabelZh: string;
  displayLabelZh: string;
  evidenceConfidence: number;
  weightTemplateId: string;
  weights: Record<string, number>;
  dimensions: Record<
    string,
    {
      code: string;
      score: number;
      weight: number;
      state: string;
      primaryIssue?: string;
      blockerCount: number;
      checks: Array<{
        checkCode: string;
        title: string;
        result: string;
        score: number;
        weight: number;
        severity: string;
      }>;
    }
  >;
  blockers: Array<{
    issueCode: string;
    title: string;
    dimension: string;
    severity: string;
    impact?: string;
    recommendedAction?: {
      actionCode: string;
      title: string;
      estimatedScoreLift?: number;
      deepLink?: string;
    };
  }>;
  pendingConfirmations: OverallTripReadinessReport['blockers'];
  recommendations: Array<{
    actionCode: string;
    title: string;
    description?: string;
    deepLink?: string;
    estimatedScoreLift?: number;
  }>;
  homepage: {
    headline: string;
    whyNotReady: string[];
    mustHandleNow: Array<{
      title: string;
      actionCode?: string;
      estimatedScoreLift?: number;
    }>;
    canHandleLater: Array<{
      title: string;
      actionCode?: string;
      estimatedScoreLift?: number;
    }>;
    potentialScoreLift: number;
    dimensionRows: Array<{
      code: string;
      labelZh: string;
      score: number;
      state: string;
      primaryIssue?: string;
    }>;
  };
  evidence: Array<{
    id: string;
    dimension: string;
    evidenceType: string;
    sourceName: string;
    statement: string;
    confidence: number;
    observedAt: string;
    expiresAt?: string;
  }>;
  expiredEvidenceCount: number;
  calculatedAt: string;
}

export type TaskPriority = 'high' | 'medium' | 'low';

export type TaskCategory =
  | 'PREFERENCE'
  | 'SCHEDULE'
  | 'SAFETY'
  | 'BUDGET'
  | 'OTHER';

export interface TripTask {
  id: string;
  text: string;
  completed: boolean;
  priority: TaskPriority;
  category: TaskCategory;
  route?: string;
  metadata?: Record<string, unknown>;
}

export type PersonaType = 'ABU' | 'DR_DRE' | 'NEPTUNE' | 'USER_ACTION';
export type AlertSeverity = 'warning' | 'info' | 'success';

export interface PersonaAlert {
  id: string;
  persona: PersonaType;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  message?: string;
  createdAt: string;
  metadata?: {
    audience?: 'user' | 'internal';
    dayId?: string;
    expressionPhase?: 'planning' | 'in_trip';
    [key: string]: unknown;
  };
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface TripHealthDimension {
  status: HealthStatus;
  score: number;
  issues: string[];
  weight?: number;
}

export interface TripHealth {
  overall: HealthStatus;
  overallScore?: number;
  dimensions: {
    schedule: TripHealthDimension;
    budget: TripHealthDimension;
    pace: TripHealthDimension;
    feasibility: TripHealthDimension;
  };
}

export interface TimelineOverviewResponse {
  tripId: string;
  stats: TimelineOverviewStats;
  /** 原规划进度（内部兼容）；主 UI 用 overallReadiness */
  planning: TimelineOverviewPlanning;
  /** 整体准备度卡片（include 含 readiness，默认 / shell / full 均含） */
  overallReadiness?: TimelineOverviewReadinessCard;
  tasks: TripTask[];
  incompleteTaskCount: number;
  todayReminders: PersonaAlert[];
  health?: TripHealth;
  /** Phase 4 — include=planobjects 时返回规划对象投影摘要 */
  planObjects?: import('../utils/timeline-plan-objects.util').TimelinePlanObjectsSummary;
  generatedAt: string;
}

export interface TimelineOverviewQuery {
  include?: TimelineOverviewInclude | TimelineOverviewInclude[] | string;
  /** shell=首屏 stats；full=phase-2（无 suggestions 列表）；显式 include 优先 */
  preset?: 'shell' | 'full';
}

/** BFF include 字符串 — 与后端 `bff-include-preset.util` 对齐 */
export const TRIP_DETAIL_TAB_BFF_INCLUDES = {
  timelineShell: 'stats,readiness',
  timelinePhase2: 'stats,pipeline,tasks,reminders,readiness',
  timelineWithSuggestions: 'stats,pipeline,tasks,reminders,readiness,suggestions',
  collabShell: 'members,health',
  collabFull: 'members,tasks,domain,votes,profiling,wishes,health',
} as const;

// ---------------------------------------------------------------------------
// Members Tab — GET /trips/:tripId/collab-overview
// ---------------------------------------------------------------------------

export type CollabOverviewInclude =
  | 'members'
  | 'tasks'
  | 'domain'
  | 'votes'
  | 'profiling'
  | 'wishes'
  | 'health';

export type CompatibilityBand = 'high' | 'needs_negotiation' | 'high_risk';

export type CollabTeamHealthStatus = 'healthy' | 'attention' | 'at_risk';

export interface CollabTeamHealth {
  progressPercent: number;
  discussionCount: number;
  highFrictionCount: number;
  compatibilityBand?: CompatibilityBand;
  status: CollabTeamHealthStatus;
}

export interface CollabOverviewMember {
  id: string;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  role: string;
}

export interface CollabOverviewTeamRef {
  teamId?: string | null;
  /** 二段加载：GET /api/v2/user/team/:teamId */
  fetchPath?: string | null;
}

export type WishCategory =
  | 'destination_route'
  | 'main_transport'
  | 'accommodation'
  | 'activities'
  | 'dining'
  | 'local_transport'
  | 'shopping'
  | 'insurance_visa';

export type DomainCrossLevel = 'low' | 'medium' | 'high';

export type CollaborativeTaskStatus = 'pending' | 'in_discussion' | 'consensus_reached';

export type CollaborativeTaskSource = 'domain_influence' | 'decision_problem';

export interface CollaborativeTaskItem {
  id: string;
  negotiationTaskId?: string;
  source: CollaborativeTaskSource;
  problemId?: string | null;
  decisionProblemId?: string | null;
  /** Phase 3 — bind tasks to selected resolution, not only the raw problem */
  resolutionId?: string | null;
  actionPlanId?: string | null;
  sourceConflictId?: string | null;
  domain: WishCategory | string;
  title: string;
  description: string;
  crossLevel: DomainCrossLevel;
  status: CollaborativeTaskStatus;
  statusLabel: string;
  claimCount: number;
  leaderDisplayName: string | null;
  endorsementSummary: string | null;
  weightSource: 'computed' | 'negotiation' | 'manual';
  closesAt: string | null;
  activeRoundId: string | null;
  isSubTask?: boolean;
  subTaskKind?: string;
  subTaskStatus?: string;
  /** 子任务负责人（isSubTask 时；任务分工 Tab 按此筛选） */
  assigneeUserId?: string | null;
  problemTitle?: string | null;
}

export interface CollabDomainInfluenceSummary {
  memberCount: number;
  completionRate: number;
  rulesConfirmed: boolean;
  balanceWarningCount: number;
  allMembersClaimed: boolean;
}

export interface SilentVoteSummary {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'closed' | string;
  closesAt?: string | null;
}

export interface ProfilingOnboardingStatus {
  tripId: string;
  userId: string;
  travelStyleCompleted: boolean;
  moneyDnaCompleted: boolean;
  quizCompleted: boolean;
  teamCompletionRate: number;
  reuse?: {
    eligible: boolean;
    quizVersion: string;
    profileQuizVersion: string | null;
    lastCompletedAt: string | null;
    lastCompletedTripLabel: string | null;
    preview: {
      travelStyleLabel: string;
      moneyDnaSummary: string;
      confidence: { travelStyle: number; moneyDna: number };
    } | null;
    blockedReason: string | null;
  };
}

export interface FrictionAlert {
  id: string;
  domain: string;
  domainLabel: string;
  level: 'red';
  memberAId: string;
  memberBId: string;
  memberAName: string;
  memberBName: string;
  summary: string;
  recommendedStrategy: string;
}

export interface ConsumptionCompatibility {
  budgetOverlapPct: number;
  styleSimilarityPct: number;
  paceSyncPct: number;
  overallScore: number;
  band: CompatibilityBand;
  bandLabel: string;
}

export interface CollabFrictionRadarSummary {
  completionRate: number;
  completedCount: number;
  memberCount: number;
  highRiskAlerts: FrictionAlert[];
  compatibility: ConsumptionCompatibility;
  computedAt: string;
}

export interface WishSummary {
  privateCount: number;
  mineCount: number;
  teamCount: number;
  agentEligibleCount: number;
}

export interface CollabOverviewResponse {
  tripId: string;
  teamId?: string | null;
  team?: CollabOverviewTeamRef;
  memberCount: number;
  travelerCount?: number;
  collaborators: CollabOverviewMember[];
  teamHealth: CollabTeamHealth;
  collaborativeTasks: CollaborativeTaskItem[];
  collaborativeTaskCount: number;
  domainInfluence?: CollabDomainInfluenceSummary;
  openSilentVoteCount: number;
  silentVotes: SilentVoteSummary[];
  profilingOnboarding?: ProfilingOnboardingStatus;
  frictionRadar?: CollabFrictionRadarSummary;
  wishSummary?: WishSummary;
  generatedAt: string;
}

export interface CollabOverviewQuery {
  include?: CollabOverviewInclude | CollabOverviewInclude[] | string;
  preset?: 'shell' | 'full';
}

// ---------------------------------------------------------------------------
// Tab 首屏并行加载（类型辅助）
// ---------------------------------------------------------------------------

/** 时间轴 Tab：与 GET /trips/:id 并行 */
export interface TripTimelineTabData {
  overview: TimelineOverviewResponse;
}

/** 成员 Tab phase-2（全量协作块，~150ms p95 冰岛 fixture） */
export interface TripMembersTabPhase2Data {
  collab: CollabOverviewResponse;
}

/** @deprecated 使用 TripMembersTabPhase2Data */
export type TripMembersTabData = TripMembersTabPhase2Data;

/** 详情页首屏四 Tab 并行（shell + 快 BFF） */
export interface TripDetailFirstPaintData {
  timeline: TimelineOverviewResponse;
  collab: CollabOverviewResponse;
  files: TripFileOverviewResponse;
  accommodation: AccommodationOverviewResponse;
}

/** 文件 Tab */
export interface TripFilesTabData {
  stats: TripFileStatsResponse;
  recentFiles: TripFileListResponse;
}
