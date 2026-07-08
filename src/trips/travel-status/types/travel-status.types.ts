/**
 * Consumer-facing Travel Status & Decision Queue — AI Native「我的旅行」BFF 契约。
 * @see internal-docs/product/TRIPNARA_AI_NATIVE_POSITIONING.md §6
 */

export const TRAVEL_STATUS_VIEW_SCHEMA_ID = 'tripnara.travel_status@v1';
export const CONSUMER_DECISION_QUEUE_SCHEMA_ID = 'tripnara.consumer_decision_queue@v1';
export const CONSUMER_DECISION_ITEM_SCHEMA_ID = 'tripnara.consumer_decision_item@v1';

export type TravelExecutabilityStatus = 'READY' | 'NEEDS_ATTENTION' | 'BLOCKED';

export interface TravelExecutabilityView {
  status: TravelExecutabilityStatus;
  headline: string;
  openDecisionCount: number;
  blockingCount: number;
  pendingVerificationCount: number;
}

export interface EffectivePlanSummaryView {
  versionId?: string;
  dayCount: number;
  lastUpdatedAt?: string;
  hasEffectivePlan: boolean;
}

export interface ConsumerDecisionRecommendation {
  title: string;
  summary?: string;
  keeps: string[];
  costs: string[];
  recommendedActionId?: string;
}

export interface ConsumerDecisionActions {
  acceptRecommended: { enabled: boolean; actionId?: string };
  keepOriginal: { enabled: boolean; actionId?: string };
  viewAlternatives: { enabled: boolean; count: number };
  defer: { enabled: boolean; actionId?: string };
}

export interface ConsumerDecisionEvidenceSummary {
  sourceLabel?: string;
  verifiedAt?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
}

export interface ConsumerDecisionItem {
  schemaId: typeof CONSUMER_DECISION_ITEM_SCHEMA_ID;
  problemId: string;
  headline: string;
  impact: string;
  explanation: string;
  severity: 'BLOCK' | 'CONFLICT' | 'VERIFY' | 'OPTIMIZE';
  affectedDayNumbers?: number[];
  affectedScopeLabel?: string;
  recommendation?: ConsumerDecisionRecommendation;
  actions: ConsumerDecisionActions;
  evidenceSummary?: ConsumerDecisionEvidenceSummary;
}

export interface ConsumerDecisionQueueView {
  schemaId: typeof CONSUMER_DECISION_QUEUE_SCHEMA_ID;
  tripId: string;
  generatedAt: string;
  headline: string;
  openCount: number;
  items: ConsumerDecisionItem[];
}

export type MonitoringPollKind =
  | 'ROAD_CLOSURE'
  | 'WEATHER_HAZARD'
  | 'FLIGHT_STATUS'
  | 'POI_CLOSURE'
  | 'BOOKING_STATUS';

export interface MonitoringItemView {
  kind: MonitoringPollKind;
  label: string;
  status: 'ACTIVE' | 'PENDING' | 'PAUSED' | 'ALERT';
  lastCheckedAt?: string;
  nextCheckAt?: string;
  summary?: string;
}

export interface AutomationAuthorizationSummary {
  defaultLevel: string;
  defaultLevelLabel: string;
  /** C 端展示档位（L0/L1 合并为 L0_L1） */
  uiLevel: import('../utils/automation-ui-level.util').AutomationUiLevel;
  uiLevelLabel: string;
  /** 概览 Tab 计数 — 从 catalog 聚合，勿用 legacy autoAllowed / confirmationRequired */
  tierCounts: import('../utils/automation-catalog-summary.projection.util').AutomationTierCounts;
  paused: boolean;
  scope: 'TRIP' | 'USER_TEMPLATE';
  /** C 端权限展示 SSOT — 六组动作 + effectiveTier */
  catalog: import('../utils/automation-catalog-summary.projection.util').AutomationCatalogSummary;
}

export interface AiActivityRecordItem {
  activityId: string;
  occurredAt: string;
  summary: string;
  changeSummary?: string;
  kind: 'DECISION_APPLIED' | 'DECISION_SUBMITTED' | 'AUTO_REPAIR' | 'MONITORING';
  problemId?: string;
  automatic: boolean;
  reversible: boolean;
  undo?: {
    enabled: boolean;
    logId?: string;
    undoActionId?: string;
  };
  status?: 'APPLIED' | 'ROLLED_BACK';
}

export interface PendingVerificationItem {
  problemId: string;
  headline: string;
  affectedDayNumbers?: number[];
}

/** 与 TripContextSnapshot 对齐的轻量引用 — 完整域见 GET /context-snapshot */
export interface TravelStatusContextSnapshotRef {
  snapshotId: string;
  revision: string;
  constraintsVersion: number;
  effectivePlanVersionId?: string;
  /** 完整 Snapshot API 路径（相对 /api） */
  detailHref: string;
}

export interface TravelStatusView {
  schemaId: typeof TRAVEL_STATUS_VIEW_SCHEMA_ID;
  tripId: string;
  generatedAt: string;
  executability: TravelExecutabilityView;
  effectivePlan: EffectivePlanSummaryView;
  openDecisions: {
    count: number;
    headline: string;
    items: ConsumerDecisionItem[];
  };
  monitoring: {
    activeCount: number;
    items: MonitoringItemView[];
  };
  automation: AutomationAuthorizationSummary;
  aiCompletedWork: {
    recentCount: number;
    items: AiActivityRecordItem[];
  };
  pendingVerification: {
    count: number;
    items: PendingVerificationItem[];
  };
  contextSnapshot: TravelStatusContextSnapshotRef;
}
