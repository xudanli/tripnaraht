/**
 * 行程列表页 · 前端 TypeScript 类型（BFF SSOT）
 *
 * 前端可复制到 `src/types/trip-list.ts`
 *
 * @see GET /api/trips/list
 */

export type TripListDisplayStatus =
  | 'planning'
  | 'pre_trip'
  | 'traveling'
  | 'completed'
  | 'cancelled';

export type TripListApiStatus = 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type TripPlanningAvailability =
  | 'collecting_info'
  | 'ready_to_generate'
  | 'generating'
  | 'ready'
  | 'failed';

export type TripListContentMode = 'poi_timeline' | 'hiking_primary' | 'skeleton_only';

export type TripListPrimaryActionIntent =
  | 'open_detail'
  | 'open_execute'
  | 'open_plan_studio'
  | 'open_insights';

export interface TripListMemberAvatar {
  userId?: string;
  name?: string;
  avatarUrl?: string | null;
}

export interface TripListTravelingSnapshot {
  weatherCelsius?: number | null;
  weatherLabel?: string | null;
  nextStopName?: string | null;
  nextStopEta?: string | null;
}

export interface TripListPrimaryAction {
  label: string;
  intent: TripListPrimaryActionIntent;
}

export interface TripListSummaryDto {
  displayStatus: TripListDisplayStatus;
  displayStatusLabel: string;
  coverImageUrl?: string | null;
  durationDays: number;
  memberCount: number;
  memberAvatars?: TripListMemberAvatar[];
  /** @deprecated 列表轻量模式通常省略 */
  progressPercent?: number | null;
  /** 整体准备度得分（来自 metadata.overallReadinessCache）；轻量列表可省略 */
  readinessScore?: number | null;
  readinessState?: string | null;
  readinessStateLabelZh?: string | null;
  budgetPerPerson?: number | null;
  traveling?: TripListTravelingSnapshot;
  primaryAction?: TripListPrimaryAction;
}

export interface TripListDayRef {
  id: string;
  date: string;
}

/**
 * 首页行程卡片（轻量 BFF）。
 * 当前服务端刻意省略：days 明细、budget、collaborators、raw metadata、
 * planningAvailability / generatingItems / tripContentMode、progress/readiness。
 */
export interface TripListCardDto {
  id: string;
  name?: string;
  destination: string;
  destinationLabel?: string;
  startDate: string;
  endDate: string;
  status: TripListApiStatus;
  totalBudget: number;
  currency?: string;
  days: TripListDayRef[];
  createdAt: string;
  updatedAt: string;
  planningAvailability?: TripPlanningAvailability;
  generatingItems?: boolean;
  tripContentMode?: TripListContentMode;
  /**
   * 列表白名单投影；轻量模式下通常省略。
   */
  metadata?: Record<string, unknown>;
  listSummary: TripListSummaryDto | null;
}

export interface TripListPageResponse {
  trips: TripListCardDto[];
  total: number;
}

export interface TripListPageQuery {
  limit?: number;
  offset?: number;
  status?: string;
  includeCancelled?: boolean;
}
