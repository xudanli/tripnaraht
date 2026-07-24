/**
 * AI 活动记录 — C 端读模型类型
 */

export const AI_ACTIVITY_LOG_SCHEMA_ID = 'tripnara.ai_activity_log@v1';
export const AI_ACTIVITY_LOG_DETAIL_SCHEMA_ID = 'tripnara.ai_activity_log_detail@v1';

export type AiActivityFilter =
  | 'ALL'
  | 'AUTO'
  | 'WAITING_CONFIRM'
  | 'WRITTEN_BACK'
  | 'CANCELLED';

export type AiActivityCategory =
  | 'MONITORING'
  | 'TIME_ROUTE'
  | 'ACTIVITY'
  | 'BUDGET_BOOKING'
  | 'SAFETY'
  | 'TEAM_PRIVACY'
  | 'VALIDATION'
  | 'OTHER';

export type AiActivityStatusTag =
  | 'AUTO_EXECUTED'
  | 'USER_CONFIRMED'
  | 'WAITING_CONFIRM'
  | 'WRITTEN_BACK'
  | 'CANCELLED';

export interface AiActivityLogSummary {
  todayActionCount: number;
  todayActionDelta: number;
  autoCompletedCount: number;
  autoCompletedPct: number;
  waitingConfirmCount: number;
  waitingConfirmPct: number;
  latestRevalidation?: {
    activityId: string;
    occurredAt: string;
    title: string;
    feasibilityBefore?: number;
    feasibilityAfter?: number;
  };
}

export interface AiActivityTimelineAction {
  viewEvidence: { enabled: boolean; href?: string };
  viewDiff: { enabled: boolean; href?: string };
  viewPlan: { enabled: boolean; href?: string };
}

export interface AiActivityTimelineItem {
  activityId: string;
  eventId: string;
  occurredAt: string;
  category: AiActivityCategory;
  categoryLabel: string;
  filterTags: AiActivityFilter[];
  statusTag: AiActivityStatusTag;
  statusLabel: string;
  title: string;
  reason: string;
  problemId?: string;
  automatic: boolean;
  reversible: boolean;
  actions: AiActivityTimelineAction;
  detailHref: string;
}

export interface AiActivityLogView {
  schemaId: typeof AI_ACTIVITY_LOG_SCHEMA_ID;
  tripId: string;
  generatedAt: string;
  summary: AiActivityLogSummary;
  filters: AiActivityFilter[];
  items: AiActivityTimelineItem[];
}

export interface AiActivityEvidenceItem {
  label: string;
  detail?: string;
  updatedAt?: string;
}

export interface AiActivityImpactMetrics {
  feasibilityScore?: { before?: number; after?: number };
  riskLevel?: { before?: string; after?: string };
}

export interface AiActivityConfirmedBy {
  userId: string;
  displayName?: string;
}

export interface AiActivityLogDetailView {
  schemaId: typeof AI_ACTIVITY_LOG_DETAIL_SCHEMA_ID;
  tripId: string;
  activityId: string;
  eventId: string;
  occurredAt: string;
  statusTag: AiActivityStatusTag;
  statusLabel: string;
  title: string;
  executionReason: string;
  evidence: AiActivityEvidenceItem[];
  impactMetrics?: AiActivityImpactMetrics;
  confirmedBy?: AiActivityConfirmedBy;
  reversible: boolean;
  undo?: {
    enabled: boolean;
    logId?: string;
    undoActionId?: string;
  };
}
