/**
 * 执行快速操作 / 成员状态 — Mobile BFF 契约类型
 * @see src/trips/execution-quick-actions/EXECUTION_QUICK_ACTIONS_API.md
 */

export const QUICK_ACTIONS_CONTEXT_SCHEMA_ID =
  'tripnara.execution_quick_actions_context@v1' as const;

/** Open reports older than this are auto-cancelled (P0: stop highlighting). */
export const MEMBER_STATUS_REPORT_TTL_MS = 3 * 60 * 60 * 1000;

export type QuickActionsScene = 'DRIVING' | 'AT_POI' | 'DELAY_RISK';

export type MemberNeedCode =
  | 'NEED_TOILET'
  | 'NEED_REST'
  | 'CARSICK'
  | 'HUNGRY'
  | 'TOO_COLD'
  | 'UNWELL'
  | 'FELL_BEHIND'
  | 'NEED_HELP'
  | 'ARRIVED'
  | 'WAIT_FOR_ME'
  | 'SHARE_LOCATION'
  | 'SKIP_NEXT'
  | 'RETURN_EARLY'
  | 'LOWER_INTENSITY'
  | 'CAN_CONTINUE';

export const MEMBER_NEED_CODES: readonly MemberNeedCode[] = [
  'NEED_TOILET',
  'NEED_REST',
  'CARSICK',
  'HUNGRY',
  'TOO_COLD',
  'UNWELL',
  'FELL_BEHIND',
  'NEED_HELP',
  'ARRIVED',
  'WAIT_FOR_ME',
  'SHARE_LOCATION',
  'SKIP_NEXT',
  'RETURN_EARLY',
  'LOWER_INTENSITY',
  'CAN_CONTINUE',
] as const;

export type MemberLifecycleStatus =
  | 'REPORTED'
  | 'TEAM_AWARE'
  | 'ARRANGED'
  | 'RESOLVED'
  | 'CANCELLED';

export type MemberReportPriority = 'NORMAL' | 'SAFETY_HIGH';

export type MemberReportSource = 'SELF' | 'PROXY';

export type TripActionCode =
  | 'NEED_REST'
  | 'CHANGE_DRIVER'
  | 'LOW_FUEL'
  | 'ROAD_MISMATCH'
  | 'VEHICLE_ISSUE'
  | 'SAFE_STOP'
  | 'PAUSE_TRIP'
  | 'ARRIVED'
  | 'START_ACTIVITY'
  | 'EXTEND_STAY'
  | 'END_EARLY'
  | 'SKIP_PLACE'
  | 'CONTACT_MERCHANT'
  | 'VIEW_ADJUST_PLAN'
  | 'NAVIGATE_MEETING'
  | 'CANCEL_ACTIVITY'
  | 'ADD_STOP'
  | 'VIEW_ALTERNATIVES'
  | 'ADJUST_REMAINING';

export type TripFieldFollowUpType =
  | 'NONE'
  | 'OPEN_ADJUSTMENT_QUEUE'
  | 'OPEN_RUNBOOK'
  | 'OPEN_NAVIGATION'
  | 'OPEN_CONTACT'
  | 'PROMPT_CHANGE_DRIVER';

export type RoadIssueCode = 'CLOSED' | 'SNOW' | 'POOR_SURFACE' | 'IMPASSABLE';

export type MemberReportListScope = 'open' | 'all' | 'mine';

export interface QuickActionsViewerRoleDto {
  isLeader: boolean;
  isOrganizer: boolean;
  isCurrentDriver: boolean;
  canManageTrip: boolean;
  canProxyReport: boolean;
}

export interface QuickActionsContextDto {
  schemaId: typeof QUICK_ACTIONS_CONTEXT_SCHEMA_ID;
  scene: QuickActionsScene;
  sceneLabelZh: string;
  viewerRole: QuickActionsViewerRoleDto;
  myStatusActions: MemberNeedCode[];
  tripActions: TripActionCode[];
  openReportCount: number;
  contextVersion?: number;
}

export interface MemberRefDto {
  memberId: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface SuggestionActionDto {
  type: 'NAVIGATE' | 'NOTIFY_TEAM' | 'CHANGE_DRIVER' | 'OPEN_SOS' | 'SHARE_LOCATION';
  labelZh: string;
  destinationId?: string;
}

export interface MemberStatusSuggestionDto {
  titleZh: string;
  placeNameZh?: string;
  placeId?: string;
  etaMinutes?: number;
  detourMinutes?: number;
  affectsHardWindow: boolean;
  hardWindowNoteZh?: string;
  primaryAction?: SuggestionActionDto;
  secondaryAction?: SuggestionActionDto;
  /** Toilet vs rest POI category hint for clients / tests */
  placeCategoryHint?: 'toilet' | 'safe_parking' | 'food' | 'indoor' | 'meeting' | 'none';
}

export interface MemberStatusArrangementDto {
  summaryZh: string;
  placeNameZh?: string;
  placeId?: string;
  etaMinutes?: number;
  arrangedByMemberId: string;
  arrangedAt: string;
}

export interface ItineraryImpactDto {
  affectsHardWindow: boolean;
  hardWindowLabelZh?: string;
  adjustmentQueueItemId?: string;
  requiresUserConfirm?: boolean;
}

export interface MemberStatusTimelineEventDto {
  at: string;
  toStatus: MemberLifecycleStatus;
  byMemberId: string;
  note?: string | null;
}

export interface MemberStatusReportDto {
  id: string;
  needCode: MemberNeedCode;
  needLabelZh: string;
  lifecycleStatus: MemberLifecycleStatus;
  lifecycleLabelZh: string;
  priority: MemberReportPriority;
  source: MemberReportSource;
  subject: MemberRefDto;
  reporter: MemberRefDto;
  sourceLabelZh: string;
  note?: string | null;
  reportedAt: string;
  updatedAt: string;
  suggestion: MemberStatusSuggestionDto | null;
  arrangement: MemberStatusArrangementDto | null;
  itineraryImpact: ItineraryImpactDto | null;
  timeline: MemberStatusTimelineEventDto[];
  allowedTransitions: MemberLifecycleStatus[];
  contextVersion?: number;
  replay?: boolean;
}

export interface MemberStatusReportListDto {
  items: MemberStatusReportDto[];
  contextVersion?: number;
}

export interface ClientContextDto {
  lat?: number;
  lng?: number;
  accuracyM?: number;
  reportedAt?: string;
}

export interface CreateMemberStatusReportBody {
  needCode: MemberNeedCode;
  source: MemberReportSource;
  subjectMemberId?: string | null;
  note?: string | null;
  clientContext?: ClientContextDto;
}

export interface TransitionMemberStatusBody {
  toStatus: MemberLifecycleStatus;
  arrangement?: {
    summaryZh: string;
    placeId?: string;
    placeNameZh?: string;
    etaMinutes?: number;
  };
  note?: string | null;
  stillNeedsHelp?: boolean;
}

export interface TripFieldReportPayload {
  roadIssue?: RoadIssueCode;
  extraMinutes?: number;
  fuelLevel?: string;
  note?: string;
  [key: string]: unknown;
}

export interface CreateTripFieldReportBody {
  actionCode: TripActionCode;
  payload?: TripFieldReportPayload;
  clientContext?: ClientContextDto;
}

export interface TripFieldFollowUpDto {
  type: TripFieldFollowUpType;
  runbookId?: string;
  itemId?: string;
  contactLabelZh?: string;
  contactValue?: string;
}

export interface TripFieldReportResponseDto {
  reportId: string | null;
  acknowledged: boolean;
  worldStateUpdated: boolean;
  suggestion: MemberStatusSuggestionDto | null;
  itineraryImpact: ItineraryImpactDto | null;
  followUp: TripFieldFollowUpDto;
  navigation?: { type: TripFieldFollowUpType; itemId?: string };
  contextVersion: number;
  replay?: boolean;
}

/** Persisted under Trip.metadata.mobileExecution */
export interface StoredMemberStatusReport {
  id: string;
  needCode: MemberNeedCode;
  lifecycleStatus: MemberLifecycleStatus;
  priority: MemberReportPriority;
  source: MemberReportSource;
  subjectMemberId: string;
  reporterMemberId: string;
  note?: string | null;
  reportedAt: string;
  updatedAt: string;
  clientContext?: ClientContextDto;
  suggestion?: MemberStatusSuggestionDto | null;
  arrangement?: MemberStatusArrangementDto | null;
  itineraryImpact?: ItineraryImpactDto | null;
  timeline: MemberStatusTimelineEventDto[];
}

export interface StoredTripFieldReport {
  id: string;
  actionCode: TripActionCode;
  payload?: TripFieldReportPayload;
  reportedByMemberId: string;
  reportedAt: string;
  resolvedAt?: string;
  clientContext?: ClientContextDto;
  itineraryImpact?: ItineraryImpactDto | null;
}

export interface QuickActionsMobileMetadata {
  memberStatusReports?: StoredMemberStatusReport[];
  tripFieldReports?: StoredTripFieldReport[];
  /** Local adj stubs when hard window affected (P0; not DecisionProblem) */
  localAdjustmentItems?: Array<{
    id: string;
    labelZh: string;
    createdAt: string;
    sourceReportId: string;
  }>;
  idempotencyKeys?: Record<string, string>;
  [key: string]: unknown;
}
