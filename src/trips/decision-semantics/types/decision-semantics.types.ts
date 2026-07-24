/**
 * TripNARA Decision Semantics V1.5 — unified decision lifecycle contracts.
 * Read-path aggregation layer; does not replace Feasibility / Gate / TripConstraint sources.
 */

import type { SemanticImpactDeclaration } from '../../decision/execution/semantic-impact.types';

// ─── Problem ────────────────────────────────────────────────────────────────

export type DecisionProblemType =
  | 'INFEASIBILITY'
  | 'RISK'
  | 'PREFERENCE_CONFLICT'
  | 'RESOURCE_CONFLICT'
  | 'EXECUTION_DEVIATION'
  | 'DATA_UNCERTAINTY';

export type DecisionProblemDetectedBy =
  | 'FEASIBILITY'
  | 'GATE'
  | 'TRIP_CONSTRAINT'
  | 'VERIFY'
  | 'GUARDIAN'
  | 'EXECUTION_MONITOR'
  | 'USER';

export type DecisionProblemStatus =
  | 'OPEN'
  | 'ASSESSING'
  | 'WAITING_DECISION'
  | 'DECIDED'
  | 'RESOLVED'
  | 'DISMISSED';

export type DecisionProblemResolutionKind = 'DECISION_EXECUTED' | 'VALIDATION_CONFIRMED';

export interface DecisionProblemResolution {
  problemId: string;
  semanticKey: string;
  resolvedAt: string;
  resolvedByDecisionId: string;
  resolvedTripVersion: string;
  resolution: DecisionProblemResolutionKind;
}

export interface DecisionProblemResolutionSummary {
  problemId: string;
  status: 'RESOLVED';
  semanticKey: string;
  resolvedAt: string;
  resolvedByDecisionId: string;
  resolution: DecisionProblemResolutionKind;
}

export interface DecisionSourceRef {
  system: DecisionProblemDetectedBy | 'TRIP_CONSTRAINT' | 'OFFICIAL_RULE';
  refId: string;
  correlationId?: string;
}

export interface DecisionProblem {
  id: string;
  tripId: string;
  type: DecisionProblemType;
  title: string;
  description: string;
  detectedBy: DecisionProblemDetectedBy;
  detectedAt: string;
  tripVersion: string;
  affectedScope: AffectedScope[];
  /** 前端可直接消费的展示投影（与 affectedScope 一一对应，去重后） */
  affectedScopeDisplay?: AffectedScopeDisplay[];
  status: DecisionProblemStatus;
  /** Stable dedupe key aligned with feasibility semanticKey / issue id */
  semanticKey?: string;
  sourceRefs: DecisionSourceRef[];
  /** Linked assertion ids (PRIMARY first) */
  assertionIds: string[];
  authority?: DecisionAuthority;
  /** Set when a decision marked this problem resolved (metadata writeback) */
  resolvedAt?: string;
  resolvedByDecisionId?: string;
  resolutionKind?: DecisionProblemResolutionKind;
  /** P1 — BFF 协商领域映射（勿在前端关键词猜测） */
  suggestedNegotiationDomain?: string;
  suggestedDecisionNode?: string;
  /** P1 — 协商任务/轮次快照 */
  negotiation?: DecisionProblemNegotiationView;
}

export type DecisionProblemNegotiationStatus =
  | 'none'
  | 'pending'
  | 'in_discussion'
  | 'closed';

export interface DecisionProblemNegotiationClosedOutcome {
  closedAt: string;
  recommendedOptionId?: string;
  summaryCN: string;
  utteranceCount: number;
}

export interface DecisionProblemNegotiationView {
  taskId: string;
  roundId: string | null;
  roundDomain: string;
  status: DecisionProblemNegotiationStatus;
  /** Whether structured negotiation UI should render (vs solo / operational-only problems) */
  visible: boolean;
  canStart: boolean;
  buttonLabel: '发起协商' | '进入协商' | null;
  focusConflictId?: string;
  closedOutcome?: DecisionProblemNegotiationClosedOutcome;
}

// ─── Constraint assertion ───────────────────────────────────────────────────

export type ConstraintSourceSystem =
  | 'TRIP_CONSTRAINT'
  | 'FEASIBILITY'
  | 'GATE'
  | 'VERIFY'
  | 'OFFICIAL_RULE'
  | 'FORECAST'
  | 'USER_PREFERENCE';

export type ConstraintNature =
  | 'HARD_CONSTRAINT'
  | 'SOFT_CONSTRAINT'
  | 'RISK_PREDICTION'
  | 'INFORMATION_GAP';

export type ConstraintDomain =
  | 'SAFETY'
  | 'TIME'
  | 'ROUTE'
  | 'BUDGET'
  | 'ACCESS'
  | 'TEAM_FIT'
  | 'ENERGY'
  | 'BOOKING'
  | 'LEGAL'
  | 'WEATHER';

export type ConstraintEnforcement =
  | 'BLOCK'
  | 'REQUIRE_ADJUSTMENT'
  | 'REQUIRE_CONFIRMATION'
  | 'WARN'
  | 'INFORM';

export type DecisionAuthorityType =
  | 'SYSTEM'
  | 'TRIP_OWNER'
  | 'DOMAIN_LEADER'
  | 'AFFECTED_MEMBERS'
  | 'ALL_MEMBERS'
  | 'HUMAN_OPERATOR';

export interface EvidenceReference {
  id?: string;
  entity?: string;
  constraint?: string;
  currentFact?: string;
  evidenceSource: string;
  evidenceType?: string;
  observedAt?: string;
  validUntil?: string;
  ruleId?: string;
  confidence?: number;
  conclusion?: string;
}

export interface ConstraintAssertion {
  id: string;
  sourceSystem: ConstraintSourceSystem;
  sourceRefId: string;
  nature: ConstraintNature;
  domain: ConstraintDomain;
  enforcement: ConstraintEnforcement;
  overridable: boolean;
  overridePolicy?: {
    allowedBy: DecisionAuthorityType[];
    requiresReason: boolean;
  };
  condition: string;
  conclusion: string;
  proofs: EvidenceReference[];
}

// ─── Affected scope ─────────────────────────────────────────────────────────

export type AffectedScopeType =
  | 'TRIP'
  | 'DAY'
  | 'ITINERARY_ITEM'
  | 'JOURNEY_LEG'
  | 'ROUTE_SEGMENT'
  | 'POI'
  | 'RESERVATION'
  | 'MEMBER'
  | 'MEMBER_GROUP';

export type MemberImpactType =
  | 'BLOCKED'
  | 'DELAYED'
  | 'FATIGUE_INCREASED'
  | 'COST_INCREASED'
  | 'EXPERIENCE_REDUCED'
  | 'SAFETY_EXPOSURE'
  | 'PREFERENCE_UNSATISFIED'
  | 'BOOKING_AT_RISK';

export interface MemberImpact {
  memberId: string;
  derivedFrom?: string[];
  impactType: MemberImpactType | string;
  explanation: string;
  confidence: number;
}

export interface AffectedScope {
  scopeType: AffectedScopeType;
  scopeId: string;
  memberImpacts?: MemberImpact[];
  impactType: MemberImpactType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  explanation?: string;
}

/** BFF 投影 — 前端直接渲染，不改变 AffectedScope 本体 */
export interface AffectedScopeDisplay {
  scopeType: AffectedScopeType;
  scopeId: string;
  label: string;
  secondaryLabel?: string;
  dayIndex?: number;
  placeNames?: string[];
  memberNames?: string[];
}

// ─── Options & tradeoffs ────────────────────────────────────────────────────

export type DecisionOptionType =
  | 'REPAIR'
  | 'ALTERNATIVE'
  | 'PLAN_B'
  | 'ACCEPT_RISK'
  | 'DEFER'
  | 'CANCEL';

export type DecisionOptionSource =
  | 'CONSTRAINT_SOLVER'
  | 'ALTERNATIVE_GENERATOR'
  | 'OPTIMIZATION_ENGINE'
  | 'RULE_ENGINE'
  | 'MULTI_PLAN'
  | 'WORLD_STATE_ADAPTER'
  | 'DOMAIN_OWNER'
  | 'USER'
  /** @deprecated Adapter-only — use CONSTRAINT_SOLVER */
  | 'CONSTRAINT_REPAIR'
  /** @deprecated Adapter-only — use ALTERNATIVE_GENERATOR */
  | 'NEPTUNE';

export type TradeoffDimensionKey =
  | 'TIME'
  | 'COST'
  | 'POI_COVERAGE'
  | 'COMFORT'
  | 'SAFETY'
  | 'FATIGUE'
  | 'SCENERY'
  | 'FLEXIBILITY'
  | 'GROUP_FAIRNESS'
  | 'BOOKING_LOSS'
  | 'CARBON'
  | 'CERTAINTY';

export type TradeoffDirection = 'IMPROVE' | 'WORSEN' | 'UNCHANGED';

export type TradeoffUnit = 'MINUTE' | 'HOUR' | 'DAY' | 'CURRENCY' | 'COUNT' | 'PERCENT';

export interface TradeoffDimension {
  dimension: TradeoffDimensionKey;
  direction: TradeoffDirection;
  value?: number;
  unit?: TradeoffUnit;
  /** POI_COVERAGE + PERCENT — e.g. 95% (+5%) */
  baselineValue?: number;
  before?: number | string;
  after?: number | string;
  affectedScope?: AffectedScope[];
  explanation?: string;
  /** BFF — 结合 affectedDays / placeNames / 成员约束 / 行程衔接的上下文叙述 */
  contextualNarrative?: string;
}

/** Decision Space option card — ordered place names for route preview strip */
export interface DecisionOptionRoutePreview {
  placeNames: string[];
}

/** Execution slip — structured preview for consumer decision cards (Slice 3.1) */
export interface ExecutionSlipRepairOptionPreview {
  scheduleContext?: import('../../guardian-decision-core/contracts/execution-slip-option-preview.types').ExecutionSlipScheduleContext;
  changePreview?: import('../../guardian-decision-core/contracts/execution-slip-option-preview.types').ExecutionSlipChangePreview;
  preserves?: string[];
  sacrifices?: string[];
}

export interface DecisionOption {
  id: string;
  problemId: string;
  type: DecisionOptionType;
  title: string;
  description: string;
  source: DecisionOptionSource;
  resolves: string[];
  introduces?: string[];
  tradeoffs: TradeoffDimension[];
  predictedImpact?: SemanticImpactDeclaration;
  executable: boolean;
  requiresConfirmation: boolean;
  /** When executable=false — user-facing reason (Unified action.blockedReason) */
  blockedReason?: string;
  authority?: DecisionAuthority;
  /** Original repair/alternative ref for traceability */
  sourceRefId?: string;
  /** P1 — structured apply intent (preview → apply chain) */
  repairCommand?: RepairCommand;
  /** P1 — how much the product can auto-execute this option */
  executionCapability?: ExecutionCapability;
  /** Decision Space — 2–4 place names in itinerary order */
  routePreview?: DecisionOptionRoutePreview;
  /** Execution slip repair card — POI / schedule preview */
  executionSlipPreview?: ExecutionSlipRepairOptionPreview;
}

// ─── Repair command (P1) ────────────────────────────────────────────────────

export type RepairCommandType =
  | 'REPLACE_POI'
  | 'REMOVE_ITEM'
  | 'MOVE_ITEM'
  | 'CHANGE_ROUTE'
  | 'SPLIT_JOURNEY'
  | 'CHANGE_HOTEL'
  | 'ADD_BUFFER'
  | 'CHANGE_DATE'
  | 'CHANGE_TRANSPORT_MODE'
  | 'ATTACH_EVIDENCE'
  | 'REVALIDATE_FEASIBILITY';

export type ExecutionCapability = 'DIRECT' | 'PARTIAL' | 'GUIDED_MANUAL' | 'ADVISORY_ONLY';

export interface EntityReference {
  entityType:
    | 'DAY'
    | 'ITINERARY_ITEM'
    | 'JOURNEY_LEG'
    | 'HOTEL'
    | 'FLIGHT'
    | 'ACTIVITY'
    | 'RESERVATION'
    | 'POI'
    | 'ROUTE_SEGMENT'
    | 'CONSTRAINT'
    | 'TRIP';
  entityId?: string;
  label?: string;
}

export interface RepairCommand {
  commandType: RepairCommandType;
  targetRefs: EntityReference[];
  parameters: Record<string, unknown>;
  sourceOptionId: string;
  expectedTripVersion: string;
}

export type DecisionExecutionStatus =
  | 'RECORDED'
  | 'APPLYING'
  | 'APPLIED'
  | 'RECOMPUTING'
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'FAILED'
  | 'ROLLED_BACK'
  /** Itinerary mutation persisted but post-apply route/feasibility recalc failed */
  | 'PARTIALLY_APPLIED'
  /** Same idempotencyKey + problem/option replay — no new repair side effect */
  | 'IDEMPOTENT_REPLAY';


export type DecisionAuthorityDomain =
  | 'SAFETY'
  | 'ROUTE'
  | 'BUDGET'
  | 'SCHEDULE'
  | 'ACCOMMODATION'
  | 'ACTIVITY'
  | 'TEAM_PREFERENCE'
  | 'BOOKING'
  | 'EMERGENCY';

export type DecisionProposer =
  | 'ABU'
  | 'DR_DRE'
  | 'NEPTUNE'
  | 'DOMAIN_LEADER'
  | 'MEMBER'
  | 'SYSTEM';

export type DecisionVetoActor =
  | 'ABU'
  | 'TRIP_OWNER'
  | 'AFFECTED_MEMBER'
  | 'OFFICIAL_RULE';

export type DecisionExecutionMode =
  | 'AUTO'
  | 'AUTO_WITH_NOTIFICATION'
  | 'EXPLICIT_CONFIRMATION'
  | 'MULTI_PARTY_APPROVAL';

export interface DecisionAuthority {
  decisionDomain: DecisionAuthorityDomain;
  proposer: DecisionProposer;
  requiredApprover: DecisionAuthorityType;
  vetoActors?: DecisionVetoActor[];
  executionMode: DecisionExecutionMode;
  overridable: boolean;
  overrideRequirements?: {
    reasonRequired: boolean;
    acknowledgementRequired: boolean;
    liabilityNoticeRequired: boolean;
  };
}

// ─── Mutation (P1+) ─────────────────────────────────────────────────────────

export type TripMutationOperation =
  | 'ADD'
  | 'REMOVE'
  | 'UPDATE'
  | 'MOVE'
  | 'REPLACE'
  | 'SPLIT'
  | 'MERGE';

export type TripMutationEntityType =
  | 'DAY'
  | 'ITINERARY_ITEM'
  | 'JOURNEY_LEG'
  | 'HOTEL'
  | 'FLIGHT'
  | 'ACTIVITY'
  | 'RESERVATION'
  | 'TRIP';

export interface TripMutation {
  operation: TripMutationOperation;
  entityType: TripMutationEntityType;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  affectedMemberIds?: string[];
  semanticEffects: TradeoffDimension[];
}

export interface TripMutationSet {
  mutationId: string;
  tripId: string;
  operations: TripMutation[];
  createdAt: string;
  createdBy: string;
  sourceDecisionId?: string;
  versionBefore: string;
  versionAfter?: string;
}

// ─── Decision record & validation (P1/P2) ─────────────────────────────────

export type DecisionActorRole = 'TRIP_OWNER' | 'DOMAIN_LEADER' | 'MEMBER' | 'SYSTEM' | 'HUMAN_OPERATOR';

export interface DecisionActor {
  role: DecisionActorRole;
  userId?: string;
  displayName?: string;
}

export interface DecisionReason {
  code?: string;
  text: string;
  source: 'USER' | 'SYSTEM' | 'POLICY';
}

export type DecisionRecordStatus =
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'PARTIALLY_APPLIED'
  | 'ROLLED_BACK'
  | 'SUPERSEDED';

export type DecisionValidationStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'PARTIALLY_VALIDATED'
  | 'CONFIRMED'
  | 'REFUTED';

/** Links a user-visible DecisionRecord to Agent Decision Ledger nodes (V1.6 P0). */
export interface DecisionLedgerRefs {
  /** Ledger nodes the decision relied on / consumed */
  sourceNodeIds: string[];
  /** Nodes invalidated after apply / mutation */
  invalidatedNodeIds?: string[];
  /** Nodes produced by incremental recompute after the decision */
  recomputedNodeIds?: string[];
  /** Batch id for one invalidation + recompute cycle */
  ledgerRunId?: string;
  /** Agent memory snapshot version when refs were captured (stale detection) */
  ledgerSnapshotVersion?: number;
  /** Ledger nodes that received caused_by edges for this decision (V1.6.1) */
  causedByAnnotatedNodeIds?: string[];
}

export type DecisionRecordKind = 'EFFECTIVE' | 'IDEMPOTENT_REPLAY_AUDIT';

export type DecisionPostApplyCoherenceV1 = {
  outcome: 'COMPLETE' | 'ROLLED_BACK' | 'PARTIALLY_APPLIED';
  phase: 'route_recalc';
  failureCode?: string;
  failureMessage?: string;
  needsRepair?: boolean;
};

export type { DecisionEvidenceFreshnessVerdict } from '../policy/decision-evidence-freshness-policy.util';

export interface DecisionRecord {
  id: string;
  tripId: string;
  problemId: string;
  selectedOptionId: string;
  /** Client-supplied key for apply idempotency (Harness release gate DS-BLOCKER-IDEMPOTENCY-001) */
  idempotencyKey?: string;
  /** Audit rows point at the decision that owns the effective side effect */
  effectiveDecisionId?: string;
  recordKind?: DecisionRecordKind;
  rejectedOptionIds: string[];
  decidedBy: DecisionActor[];
  authoritySnapshot: DecisionAuthority;
  reasons: DecisionReason[];
  decidedAt: string;
  tripVersionBefore: string;
  tripVersionAfter?: string;
  predictedImpact?: SemanticImpactDeclaration;
  actualMutation?: TripMutationSet;
  status: DecisionRecordStatus;
  validationStatus: DecisionValidationStatus;
  /** Agent Decision Ledger cross-reference (optional when no ledger exists) */
  ledgerRefs?: DecisionLedgerRefs;
  /** 决策时刻写入的预测 outcome（validation 对比基准） */
  expectedOutcomes?: ExpectedOutcome[];
  /** 决策执行后 feasibility 快照基线 */
  validationBaseline?: DecisionValidationBaseline;
  /** 最近一次 validation 结果缓存 */
  lastOutcomeValidation?: DecisionOutcomeValidation;
  /** applyRepair 后 route/feasibility 重算一致性（STATE-BLOCKER-PARTIAL-001） */
  postApplyCoherence?: DecisionPostApplyCoherenceV1;
  /** 半成功态：需后续 repair / 用户确认 */
  needsRepair?: boolean;
}

export interface DecisionValidationBaseline {
  capturedAt: string;
  feasibilityMustHandle: number;
  feasibilityVerdict: string;
  problemOpen: boolean;
  overallScore?: number;
  canStartExecute?: boolean;
}

export type ExpectedOutcomeMetric =
  | 'ARRIVAL_TIME'
  | 'DRIVING_DURATION'
  | 'WAIT_TIME'
  | 'COST'
  | 'FATIGUE'
  | 'ACTIVITY_COMPLETION'
  | 'CONSTRAINT_VIOLATION'
  | 'USER_SATISFACTION'
  | 'GROUP_CONFLICT';

export interface ExpectedOutcome {
  metric: ExpectedOutcomeMetric;
  expectedValue: number | string | boolean;
  tolerance?: number;
  validAt?: string;
  affectedScope: AffectedScope[];
}

export type ObservedOutcomeSource =
  | 'GPS'
  | 'USER_CONFIRMATION'
  | 'USER_ARRIVAL_CLICK'
  | 'ITINERARY_ITEM_STATUS'
  | 'BOOKING_CHECKIN'
  | 'NAVIGATION_EVENT'
  | 'BOOKING_STATUS'
  | 'WEATHER_FEED'
  | 'ROAD_FEED'
  | 'POI_FEEDBACK'
  | 'SYSTEM_INFERENCE';

export interface ObservedOutcome {
  metric: string;
  actualValue: number | string | boolean;
  observedAt: string;
  source: ObservedOutcomeSource;
  confidence: number;
}

/** P3 — experience layer; does not drive primary validation verdict */
export type ExperienceOutcomeMetric = 'USER_SATISFACTION' | 'REGRET' | 'GROUP_CONFLICT';

export type ExperienceOutcomeSource = 'USER_CONFIRMATION' | 'SURVEY';

export interface ExperienceOutcome {
  metric: ExperienceOutcomeMetric;
  value: number | string;
  source: ExperienceOutcomeSource;
  observedAt: string;
  context?: string;
}

export type OutcomeValidationVerdict =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PARTIALLY_CONFIRMED'
  | 'REFUTED'
  | 'INCONCLUSIVE';

export type OutcomeFailureReason =
  | 'PREDICTION_ERROR'
  | 'DATA_STALE'
  | 'EXECUTION_DEVIATION'
  | 'USER_BEHAVIOR_CHANGE'
  | 'EXTERNAL_EVENT'
  | 'INSUFFICIENT_EVIDENCE';

export interface DecisionOutcomeValidation {
  id: string;
  decisionId: string;
  tripId: string;
  expectedOutcomes: ExpectedOutcome[];
  observedOutcomes: ObservedOutcome[];
  /** 体验层补充（满意度等），不参与主 verdict */
  experienceOutcomes?: ExperienceOutcome[];
  verdict: OutcomeValidationVerdict;
  evaluatedAt?: string;
  confidence?: number;
  explanation?: string;
  failureReasons?: OutcomeFailureReason[];
}

// ─── API read models ────────────────────────────────────────────────────────

export interface DecisionProblemListMeta {
  tripId: string;
  tripVersion: string;
  total: number;
  byType: Partial<Record<DecisionProblemType, number>>;
  byStatus: Partial<Record<DecisionProblemStatus, number>>;
  generatedAt: string;
}

export interface DecisionProblemSummary {
  id: string;
  type: DecisionProblemType;
  title: string;
  status: DecisionProblemStatus;
  detectedBy: DecisionProblemDetectedBy;
  primaryEnforcement?: ConstraintEnforcement;
  semanticKey?: string;
  affectedDayNumbers: number[];
  optionCount?: number;
}

export interface DecisionProblemDetail extends DecisionProblem {
  assertions: ConstraintAssertion[];
}

export interface DecisionOptionsResponse {
  problemId: string;
  tripId: string;
  options: DecisionOption[];
  generatedAt: string;
}

export interface DecisionOptionPreviewResponse {
  problemId: string;
  optionId: string;
  tripId: string;
  predictedImpact?: SemanticImpactDeclaration;
  tradeoffs: TradeoffDimension[];
  proposedMutations: TripMutationSet;
  authority: DecisionAuthority;
  /** Ack strings client must submit with resolution (aligned with authority matrix) */
  requiredAcknowledgements?: string[];
  repairCommand?: RepairCommand;
  executionCapability?: ExecutionCapability;
  /** Passthrough from feasibility/readiness repair preview when available */
  repairPreview?: Record<string, unknown>;
  generatedAt: string;
}

export interface CreateDecisionRequestBody {
  problemId: string;
  selectedOptionId: string;
  /** Stable client key — duplicate POST returns IDEMPOTENT_REPLAY without re-applying repair */
  idempotencyKey?: string;
  reason?: string;
  acknowledgement?: string[];
  rejectedOptionIds?: string[];
  /** 批准后是否调用 feasibility.applyRepair（默认 true） */
  execute?: boolean;
  executeDecision?: boolean;
  persistDecision?: boolean;
  runGuardianNegotiation?: boolean;
  forceDecisionRepair?: boolean;
  parkingReservationRef?: string;
  evidenceAttachmentId?: string;
}

export interface DecisionApplyResultSummary {
  status: string;
  message: string;
  actionType?: string;
  persisted?: boolean;
  blockerId?: string;
}

export interface CreateDecisionResponse {
  decision: DecisionRecord;
  tripVersionAfter?: string;
  appliedMutations?: TripMutationSet;
  applyResult?: DecisionApplyResultSummary;
  /** P1 — user-visible execution lifecycle snapshot */
  executionStatus?: DecisionExecutionStatus;
  /** True when this request was a replay of an already-applied idempotent decision */
  idempotentReplay?: boolean;
  /** Effective decision id when `executionStatus === 'IDEMPOTENT_REPLAY'` */
  effectiveDecisionId?: string;
  /** Problem status after this request (writeback when decision executed) */
  problemResolution?: DecisionProblemResolutionSummary;
  postApplyCoherence?: DecisionPostApplyCoherenceV1;
  needsRepair?: boolean;
  /** Auto-repair blocked because supporting evidence is stale (POLICY-BLOCKER-STALE-001) */
  evidenceFreshnessBlock?: import('../policy/decision-evidence-freshness-policy.util').DecisionEvidenceFreshnessVerdict;
}

export interface DecisionCenterOverview {
  tripId: string;
  tripVersion: string;
  generatedAt: string;
  feasibility?: {
    verdict?: string;
    overallScore?: number;
    canStartExecute?: boolean;
    mustHandleCount?: number;
  };
  problemCounts: {
    total: number;
    open: number;
    byEnforcement: Partial<Record<ConstraintEnforcement, number>>;
    byStatus: Partial<Record<DecisionProblemStatus, number>>;
  };
  /** Open queue-eligible problems (excludes INFORM / notices) */
  totalOpenProblemCount?: number;
  /** Open problems requiring user or team action */
  actionableProblemCount: number;
  blockingProblemCount?: number;
  waitingUserDecisionCount?: number;
  waitingTeamDecisionCount?: number;
  applyingCount?: number;
  staleEvidenceCount?: number;
  /** Sum of occurrenceCount across open queue-eligible problems */
  occurrenceCount?: number;
  affectedDayNumbers: number[];
  affectedMemberIds: string[];
  /** Aggregated copy for L1 banner */
  headline: string;
  recentDecisions: DecisionExecutionSnapshot[];
}

export interface DecisionExecutionSnapshot {
  decisionId: string;
  problemId: string;
  selectedOptionId: string;
  /** @deprecated Prefer executionStatus — kept for backward compatibility */
  status: DecisionExecutionStatus;
  /** User-visible execution lifecycle (L1 band / DC-FE-007) */
  executionStatus: DecisionExecutionStatus;
  /** Underlying DecisionRecord.status */
  recordStatus: DecisionRecordStatus;
  needsRepair?: boolean;
  decidedAt: string;
  tripVersionBefore: string;
  tripVersionAfter?: string;
}

export interface DecisionExecutionStatusResponse {
  decisionId: string;
  tripId: string;
  problemId: string;
  selectedOptionId: string;
  status: DecisionExecutionStatus;
  recordStatus: DecisionRecordStatus;
  validationStatus: DecisionValidationStatus;
  decidedAt: string;
  tripVersionBefore: string;
  tripVersionAfter?: string;
  applyResult?: DecisionApplyResultSummary;
  explanation: string;
  validationVerdict?: OutcomeValidationVerdict;
  repairCommandApplied?: boolean;
  effectiveDecisionId?: string;
  postApplyCoherence?: DecisionPostApplyCoherenceV1;
  needsRepair?: boolean;
  generatedAt: string;
}
