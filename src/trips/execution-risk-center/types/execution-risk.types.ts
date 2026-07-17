/** Execution Risk Center — unified read model (P0) */

import type { RiskMetricBag } from '../knowledge/risk-metric-extraction.util';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ExecutionGate = 'ALLOW' | 'AT_RISK' | 'REPLAN_REQUIRED' | 'STOP';

export type ActiveRiskType =
  | 'ENVIRONMENT'
  | 'ROAD_TRANSPORT'
  | 'MEMBER_STATE'
  | 'ROUTE_EXECUTION'
  | 'SCHEDULE'
  | 'BOOKING_FULFILLMENT'
  | 'TEAM_COORDINATION'
  | 'RESOURCE';

export type ActiveRiskCode =
  | 'WEATHER_STRONG_WIND'
  | 'WEATHER_HEAVY_RAIN'
  | 'WEATHER_SEVERE'
  | 'ROAD_SLIPPERY'
  | 'ROAD_CLOSED'
  | 'MEMBER_DRIVER_FATIGUE'
  | 'MEMBER_PHYSICAL_FATIGUE'
  | 'ROUTE_DEVIATION'
  | 'SCHEDULE_DELAY'
  | 'BOOKING_WINDOW_AT_RISK'
  | 'TEAM_COORDINATION'
  | 'GENERIC';

export type RiskLifecycleStatus =
  | 'DETECTED'
  | 'ACTIVE'
  | 'ESCALATED'
  | 'MITIGATED'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'STALE';

export type RiskAcknowledgementStatus = 'UNSEEN' | 'SEEN' | 'ACKNOWLEDGED' | 'SNOOZED';

export type RiskTreatmentStatus =
  | 'NO_ACTION_REQUIRED'
  | 'ACTION_REQUIRED'
  | 'DECISION_REQUIRED'
  | 'APPLYING'
  | 'APPLIED'
  | 'FAILED';

export type RiskSourceSystem =
  | 'ENVIRONMENT_EVENT'
  | 'DECISION_PROBLEM'
  | 'ATTENTION_QUEUE'
  | 'TRAVEL_RISK_EVENT'
  | 'MEMBER_RUNTIME'
  | 'ROUTE_RUNTIME';

export interface RiskSourceRef {
  sourceSystem: RiskSourceSystem;
  sourceId: string;
  sourceVersion?: string;
}

export interface AffectedRef {
  id: string;
  label: string;
  kind: 'member' | 'activity' | 'location' | 'route_segment' | 'booking';
}

export interface EvidenceRef {
  id: string;
  label?: string;
  observedAt?: string;
}

export interface ActiveRisk {
  id: string;
  riskKey: string;
  tripId: string;

  type: ActiveRiskType;
  code: ActiveRiskCode;
  title: string;
  summary: string;

  /** Package knowledge layer — Sprint 1 */
  knowledgeCode?: string;
  matchedRuleId?: string;
  isRootCause?: boolean;
  generationMode?: 'DIRECT_DETECTION' | 'CAUSAL_DERIVATION' | 'PLAN_SIMULATION' | 'PROJECTION_ONLY';
  observedMetrics?: RiskMetricBag;
  metricValue?: number | string;
  metricUnit?: string;
  rootEventId?: string;
  causalParentId?: string;

  /** ER-AC-006: evaluation incomplete when required metrics absent */
  severityState?: 'KNOWN' | 'UNKNOWN';
  dataGaps?: string[];

  /** ER-AC-011: downgrade guard when severity improves */
  hysteresis?: {
    readingsRequired: number;
    readingsConfirmed: number;
    canDowngrade: boolean;
  };

  level: RiskLevel;
  executionGate?: ExecutionGate;

  lifecycleStatus: RiskLifecycleStatus;
  acknowledgementStatus: RiskAcknowledgementStatus;
  treatmentStatus: RiskTreatmentStatus;

  detectedAt: string;
  updatedAt: string;
  impactStartAt?: string;
  impactEndAt?: string;
  validUntil?: string;

  affectedMembers: AffectedRef[];
  affectedActivities: AffectedRef[];
  affectedLocations: AffectedRef[];
  affectedRouteSegments: AffectedRef[];

  sourceRefs: RiskSourceRef[];
  evidenceRefs: EvidenceRef[];

  confidence?: number;
  actionDeadline?: string;

  recommendationIds: string[];
  interventionIds: string[];
  decisionProblemIds: string[];

  /** Internal merge priority — higher wins on field conflicts */
  sourcePriority?: number;
}

export interface ExecutionRiskSummaryRecommendation {
  headline: string;
  explanation: string;
  recommendedAction: string;
  actionDeadline?: string;
  basedOnRiskIds: string[];
  recommendationIds: string[];
  generatedAt: string;
  validUntil?: string;
}

export interface ExecutionRiskSummaryDto {
  tripId: string;
  date: string;
  overallLevel: RiskLevel;
  executionGate: ExecutionGate;
  activeRiskCount: number;
  unacknowledgedCount: number;
  unresolvedCount: number;
  actionRequiredCount: number;
  impactWindows: Array<{ startAt: string; endAt: string }>;
  summary: string;
  recommendation?: ExecutionRiskSummaryRecommendation;
  generatedAt: string;
}

export interface ExecutionRiskListQuery {
  lifecycleStatus?: RiskLifecycleStatus[];
  acknowledgementStatus?: RiskAcknowledgementStatus[];
  treatmentStatus?: RiskTreatmentStatus[];
  level?: RiskLevel[];
  type?: ActiveRiskType[];
  date?: string;
}

export interface ExecutionRiskMemberImpactDto {
  memberId: string;
  label: string;
  impactType: string;
  explanation: string;
  direction?: string;
  degree?: string;
}

export interface ExecutionRiskRecommendationDto {
  id: string;
  riskId: string;
  /** Client card title — preferred over label */
  title?: string;
  label: string;
  description: string;
  isRecommended?: boolean;
  impactSummary?: string;
  /** Short benefit chips for scheme cards (e.g. 推荐 / -30min / 提升安全) */
  benefitTags?: string[];
  /** Knowledge three-plan type when sourced from cluster generator */
  planType?: string;
  actionCodes?: string[];
  /** Per-member impact projection for recommendation cards / preview */
  memberImpacts?: ExecutionRiskMemberImpactDto[];
  sourceSystem: RiskSourceSystem;
  sourceId: string;
  recommendationVersion?: string;
  validUntil?: string;
}

export type ExecutionRiskApplyStatus = 'REQUIRES_CONFIRMATION' | 'APPLIED' | 'REJECTED' | 'PREVIEW';

export interface ExecutionRiskApplyRequestDto {
  idempotencyKey?: string;
  requestedBy?: string;
  /** Client-held effective plan version for PLAN_VERSION_CONFLICT guard (MAT-006). */
  expectedPlanVersionId?: string;
}

export interface ExecutionRiskApplyResponseDto {
  executionStatus: ExecutionRiskApplyStatus;
  riskId: string;
  recommendationId: string;
  decisionProblemId?: string;
  planDiffId?: string;
  /** Human-readable preview — AC-004 */
  preview?: string;
  /** Structured before/after comparison — OpenAPI required */
  planDiff?: import('../../../generated/execution-risk-contracts').PlanDiff;
  /** Idempotency key echoed for subsequent confirm */
  idempotencyKey?: string;
  /** Effective plan version at preview time — pass back on confirm for MAT-006. */
  expectedPlanVersionId?: string;
  /** Simulated risks after apply (preview only) */
  projectedRisks?: ActiveRisk[];
  requiresConfirmation?: boolean;
  confirmHint?: string;
  /** Per-member impact preview after adopting this recommendation */
  memberImpacts?: ExecutionRiskMemberImpactDto[];
  /** Bumped after Active Plan write — clients refresh when greater than local cache */
  contextVersion?: number;
  planVersion?: number;
  validation?: {
    gate: ExecutionGate;
    newRisks: string[];
    resolvedRiskIds: string[];
  };
  /** Set when response is served from idempotency cache (AC-012) */
  idempotentReplay?: boolean;
}

export interface ConfirmExecutionRiskApplyRequestDto {
  confirm: boolean;
  idempotencyKey?: string;
  confirmedBy?: string;
  expectedPlanVersionId?: string;
}

export interface ConfirmExecutionRiskApplyResponseDto extends ExecutionRiskApplyResponseDto {
  applied?: boolean;
  newPlanVersionId?: string;
  ledgerRef?: string;
  effectivePlanVersionId?: string;
  planActivated?: boolean;
  itineraryMaterialized?: boolean;
  riskRefreshSnapshotId?: string;
  updatedRisks?: ActiveRisk[];
  decisionQueue?: unknown;
  advisoryApply?: unknown;
  environmentResolution?: unknown;
}

export interface AcknowledgeExecutionRiskDto {
  snoozeUntil?: string;
}

export interface TripExecutionRiskUserStateRecord {
  tripId: string;
  riskKey: string;
  userId: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  snoozedUntil?: string;
  dismissedAt?: string;
  lastViewedAt?: string;
}

/** Partial risk from a source adapter before merge + user state overlay */
export type RiskSourceProjection = Omit<
  ActiveRisk,
  'id' | 'acknowledgementStatus' | 'treatmentStatus'
> & {
  acknowledgementStatus?: never;
  treatmentStatus?: never;
};
