/**
 * 行中执行首页 / Runbook / Verified Proposal — Mobile BFF 契约类型
 * @see src/trips/in-trip-home/IN_TRIP_HOME_API.md
 */

export const IN_TRIP_HOME_SCHEMA_ID = 'tripnara.in_trip_home@v1' as const;
export const EXECUTION_RUNBOOK_SCHEMA_ID = 'tripnara.execution_runbook@v1' as const;
export const VERIFIED_PROPOSAL_SCHEMA_ID = 'tripnara.verified_proposal@v1' as const;

export type InTripAttention = 'ON_TRACK' | 'NEEDS_ATTENTION' | 'BLOCKED';

export type InlineReminderKind =
  | 'ETA_INCREASED'
  | 'WIND_INCREASED'
  | 'FUEL_SUGGESTED'
  | 'REST_SUGGESTED'
  | 'SUNSET_BUFFER_DROP';

export type ImportantInfoKind =
  | 'NEXT_ROAD_STATUS'
  | 'REMAINING_DRIVE'
  | 'DELAY_INTERVAL'
  | 'NEXT_SAFE_PARKING'
  | 'NEXT_FUEL'
  | 'NEXT_HARD_WINDOW'
  | 'CURRENT_RISK';

export type ImportantInfoTrailingStyle =
  | 'PLAIN'
  | 'EMPHASIS'
  | 'WARNING'
  | 'SUCCESS_BADGE'
  | 'WARNING_BADGE'
  | 'REST_SUGGESTED';

export type RunbookTrigger =
  | 'ROAD_CLOSURE'
  | 'STRONG_WIND'
  | 'FUEL_INSUFFICIENT'
  | 'BOOKING_ETA_MISS';

export type RunbookSeverity = 'HIGH' | 'CRITICAL';

export type ConfirmReasonCode =
  | 'CHANGE_MAIN_ROUTE'
  | 'DELETE_ACTIVITY'
  | 'CHANGE_LODGING'
  | 'LARGE_DETOUR'
  | 'SIGNIFICANT_DRIVE_INCREASE'
  | 'ACCEPT_HIGH_RISK'
  | 'AFFECTS_BOOKED_ITEM';

export const IMPORTANT_INFO_ORDER: ImportantInfoKind[] = [
  'NEXT_ROAD_STATUS',
  'REMAINING_DRIVE',
  'DELAY_INTERVAL',
  'NEXT_SAFE_PARKING',
  'NEXT_FUEL',
  'NEXT_HARD_WINDOW',
  'CURRENT_RISK',
];

export const IMPORTANT_INFO_TITLES_ZH: Record<ImportantInfoKind, string> = {
  NEXT_ROAD_STATUS: '下一段道路状态',
  REMAINING_DRIVE: '剩余驾驶时间',
  DELAY_INTERVAL: '当前延误区间',
  NEXT_SAFE_PARKING: '下一个安全停车点',
  NEXT_FUEL: '下一个加油点',
  NEXT_HARD_WINDOW: '下一个硬时间窗',
  CURRENT_RISK: '当前风险',
};

export const RUNBOOK_TRIGGER_TITLES_ZH: Record<RunbookTrigger, string> = {
  ROAD_CLOSURE: '路段关闭',
  STRONG_WIND: '强风高风险',
  FUEL_INSUFFICIENT: '燃油不足',
  BOOKING_ETA_MISS: '预计错过集合',
};

export const ATTENTION_LABELS_ZH: Record<InTripAttention, string> = {
  ON_TRACK: '正常',
  NEEDS_ATTENTION: '需关注',
  BLOCKED: '需处理',
};

export interface InTripHeadingDto {
  destinationNameZh: string;
  destinationLocalName?: string;
  etaRangeLabelZh: string;
  attention: InTripAttention;
  attentionLabelZh: string;
  progress?: number;
  distanceProgressLabelZh?: string;
  remainingDurationLabelZh?: string;
  toItemId?: string;
}

export interface InlineReminderDto {
  id: string;
  kind: InlineReminderKind;
  titleZh: string;
  messageZh: string;
  dismissible: boolean;
}

export interface AppliedProposalSummaryDto {
  proposalId: string;
  titleZh: string;
  detailZh: string;
  appliedAt?: string;
}

export interface ImportantInfoRowDto {
  kind: ImportantInfoKind;
  titleZh: string;
  detailZh: string;
  trailingZh?: string;
  trailingStyle: ImportantInfoTrailingStyle;
  relatedRiskId?: string;
  relatedPoiId?: string;
  relatedItemId?: string;
  /** 内部投影用；缺数据时为 UNKNOWN（仍输出行） */
  status?: 'OK' | 'ATTENTION' | 'UNKNOWN';
}

export interface ActiveRunbookSummaryDto {
  runbookId: string;
  trigger: RunbookTrigger;
  triggerTitleZh: string;
  alertSummaryZh: string;
  pageTitleZh: string;
  severity: RunbookSeverity;
}

export interface InTripHomeDto {
  schemaId: typeof IN_TRIP_HOME_SCHEMA_ID;
  heading: InTripHeadingDto;
  inlineReminder?: InlineReminderDto | null;
  appliedProposal?: AppliedProposalSummaryDto | null;
  importantInfo: ImportantInfoRowDto[];
  activeRunbook?: ActiveRunbookSummaryDto | null;
  evidence?: {
    updatedAt?: string;
    confidence?: number;
  };
  contextVersion?: number;
}

export interface RunbookOptionDto {
  optionId: string;
  letter: string;
  titleZh: string;
  subtitleZh: string;
  impactLabelZh?: string;
  isRecommended: boolean;
  verifiedProposalId?: string;
}

export interface ExecutionRunbookDto {
  schemaId: typeof EXECUTION_RUNBOOK_SCHEMA_ID;
  runbookId: string;
  trigger: RunbookTrigger;
  pageTitleZh: string;
  alertSummaryZh: string;
  whatHappenedZh: string;
  doFirstZh: string;
  impactedItemsZh: string[];
  options: RunbookOptionDto[];
  recommendationZh: string;
  requiresParkConfirmZh: string;
  requiresUserConfirm: boolean;
  recommendedOptionId: string;
  relatedRiskId?: string;
  relatedAlertId?: string;
  contextVersion?: number;
}

export interface VerifiedProposalDto {
  schemaId: typeof VERIFIED_PROPOSAL_SCHEMA_ID;
  proposalId: string;
  runbookId: string;
  optionId: string;
  optionLetter: string;
  titleZh: string;
  impact: {
    delayLabelZh: string;
    detourDistanceLabelZh: string;
    bulletsZh: string[];
  };
  routePreview?: {
    noteZh?: string;
    geometryGeoJson?: object;
  };
  confirmReasonsZh: string[];
  confirmReasonCodes: ConfirmReasonCode[];
  expiresAt?: string;
  contextVersion?: number;
}

export interface ApplyVerifiedProposalResponseDto {
  proposalId: string;
  applied: true;
  appliedAt: string;
  contextVersion: number;
  replay?: boolean;
  inTripHome?: InTripHomeDto;
  appliedProposal?: AppliedProposalSummaryDto;
}

export interface DismissInlineReminderResponseDto {
  dismissed: true;
  reminderId: string;
  replay?: boolean;
  contextVersion?: number;
}

export interface DeferRunbookResponseDto {
  deferred: true;
  runbookId: string;
  replay?: boolean;
  contextVersion: number;
  inTripHome?: InTripHomeDto;
}

export interface AcknowledgeRunbookResponseDto {
  acknowledged: true;
  runbookId: string;
  replay?: boolean;
  contextVersion: number;
  inTripHome?: InTripHomeDto;
}

/** Trip.metadata.mobileExecution.inTripHome 持久化形状 */
export interface StoredVerifiedProposal {
  proposalId: string;
  runbookId: string;
  optionId: string;
  optionLetter: string;
  titleZh: string;
  impact: VerifiedProposalDto['impact'];
  routePreview?: VerifiedProposalDto['routePreview'];
  confirmReasonsZh: string[];
  confirmReasonCodes: ConfirmReasonCode[];
  expiresAt?: string;
  status: 'ACTIVE' | 'APPLIED' | 'EXPIRED';
  appliedAt?: string;
  appliedByMemberId?: string;
}

export interface StoredRunbookState {
  runbookId: string;
  trigger: RunbookTrigger;
  pageTitleZh: string;
  alertSummaryZh: string;
  whatHappenedZh: string;
  doFirstZh: string;
  impactedItemsZh: string[];
  options: RunbookOptionDto[];
  recommendationZh: string;
  requiresParkConfirmZh: string;
  requiresUserConfirm: boolean;
  recommendedOptionId: string;
  relatedRiskId?: string;
  relatedAlertId?: string;
  severity: RunbookSeverity;
  status: 'ACTIVE' | 'CLOSED' | 'DEFERRED' | 'ACKNOWLEDGED';
  createdAt: string;
  deferredAt?: string;
  acknowledgedAt?: string;
}

export interface InTripHomeMetadata {
  /** userId → dismissed reminder ids */
  dismissedReminderIdsByUser?: Record<string, string[]>;
  appliedProposal?: AppliedProposalSummaryDto;
  runbooksById?: Record<string, StoredRunbookState>;
  proposalsById?: Record<string, StoredVerifiedProposal>;
  /** Idempotency-Key → apply|dismiss target id */
  idempotencyKeys?: Record<string, string>;
}
