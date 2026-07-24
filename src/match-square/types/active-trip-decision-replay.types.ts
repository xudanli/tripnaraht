/** PRD 3.12 — Active Trip 行中决策 Replay（Match Square 飞轮 → Abu 叙事） */

import type { CollaborativeFlywheelAuditReport } from '../observability/collaborative-flywheel-replay-audit.util';

export const ACTIVE_TRIP_DECISION_REPLAY_VERSION = 'active_trip_decision_replay_v1' as const;

export type ActiveTripReplayEventSource =
  | 'collaborative_task'
  | 'route_rollback'
  | 'vault_contract';

export interface ActiveTripReplayTimelineEntry {
  eventId: string;
  at: string;
  source: ActiveTripReplayEventSource;
  action: string;
  actorUserId: string;
  summaryZh: string;
  taskId?: string | null;
  proposalId?: string | null;
  milestoneId?: string | null;
  responseLatencyMs?: number | null;
  revisionCountAfter?: number | null;
}

export interface ActiveTripReplayKeyDecisionPoint {
  at: string;
  titleZh: string;
  abuInsightZh: string;
  evidenceRefs: string[];
}

export interface ActiveTripReplayPersonaSections {
  abu: string;
  drDre: string;
  neptune: string;
}

export interface ActiveTripReplayFlywheelMetrics {
  collaborativeTaskEvents: number;
  routeRollbackEvents: number;
  vaultContractEvents: number;
  taskConfirmLatencyMsAvg: number | null;
  routeRollbackConfirmLatencyMs: number | null;
  taskRevisionTotal: number;
}

export interface ActiveTripDecisionReplayView {
  version: typeof ACTIVE_TRIP_DECISION_REPLAY_VERSION;
  tripId: string;
  recruitmentPostId: string | null;
  catalogId: string | null;
  timeline: ActiveTripReplayTimelineEntry[];
  keyDecisionPoints: ActiveTripReplayKeyDecisionPoint[];
  personaSections: ActiveTripReplayPersonaSections;
  /** 主 UI 文案 — Abu 归因叙事 */
  abuNarrative: string;
  flywheelMetrics: ActiveTripReplayFlywheelMetrics;
  generatedAt: string;
  /** PRD 3.13 — 拼团预测 vs 行后观测 fingerprint 对撞（有 DB snapshot 时返回） */
  flywheelAuditReport?: ActiveTripFlywheelAuditReportView | null;
}

/** decision-replay API 附带的飞轮审计摘要 */
export interface ActiveTripFlywheelAuditReportView extends CollaborativeFlywheelAuditReport {
  snapshotId: string | null;
  applicationId: string | null;
  tripId: string | null;
}

/** 行后脱敏回流 Route Template 的预览 payload（不写 DB） */
export interface RouteTemplateTripBackflowPreview {
  catalogId: string | null;
  routeDirectionName: string | null;
  anonymizedCrewSize: number;
  taskCompletionRate: number;
  rollbackConsensusRate: number | null;
  vaultAuthorizationRate: number | null;
  suggestedExampleTitleZh: string;
  suggestedExampleSummaryZh: string;
  featureTags: string[];
}

export const ROUTE_TEMPLATE_BACKFLOW_VERSION = 'match_square_backflow_v1' as const;

export interface RouteTemplateBackflowExampleRecord {
  exampleId: string;
  version: typeof ROUTE_TEMPLATE_BACKFLOW_VERSION;
  catalogId: string;
  committedAt: string;
  anonymizedCrewSize: number;
  titleZh: string;
  summaryZh: string;
  featureTags: string[];
  flywheelMetrics: ActiveTripReplayFlywheelMetrics;
  timelineEventCount: number;
  note: string | null;
}

export interface RouteTemplateBackflowCommitResultView {
  tripId: string;
  routeTemplateId: number;
  routeTemplateUuid: string;
  catalogId: string;
  example: RouteTemplateBackflowExampleRecord;
  preview: RouteTemplateTripBackflowPreview;
  alreadyCommitted: boolean;
}
