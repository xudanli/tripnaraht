/**
 * Unified Decision Problem UI contract — product-facing read model (SSOT projection).
 * Migration routing metadata lives in `debug` only when `includeDebug=true`.
 */

import type {
  ConstraintEnforcement,
  DecisionOptionType,
  DecisionProblemStatus,
  DecisionProblemType,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { DecisionRouteResult } from './decision-gateway.types';

export type DecisionDimension =
  | 'SCHEDULE'
  | 'TRANSPORT'
  | 'BOOKING'
  | 'ENVIRONMENT'
  | 'TEAM_FIT'
  | 'STRUCTURE'
  | 'ACCESS_CAPACITY'
  | 'EXPERIENCE'
  | 'BUDGET'
  | 'OTHER';

export type DecisionProblemPhase = 'PLANNING' | 'EXECUTION' | 'LIVE';

/** Workflow lifecycle — distinct from execution landing status. */
export type DecisionProblemWorkflowStatus = DecisionProblemStatus | 'DECIDED';

export type DecisionProblemExecutionStatus =
  | 'NOT_REQUIRED'
  | 'NOT_STARTED'
  | 'DRAFT_CREATED'
  | 'APPLYING'
  | 'APPLIED'
  | 'VERIFIED'
  | 'FAILED'
  | 'ROLLED_BACK';

export type DecisionEvidenceFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface DecisionProblemScope {
  tripId: string;
  dayIds?: number[];
  itemIds?: string[];
  routeSegmentIds?: string[];
  memberIds?: string[];
}

export interface DecisionProblemOccurrence {
  occurrenceId: string;
  dayId?: number;
  itemIds?: string[];
  routeSegmentId?: string;
  /** Shadow / drill — first observation timestamp for orchestration ordering */
  observedAt?: string;
}

/** Multi-source finding lineage (product-facing). */
export interface DecisionProblemDetector {
  detectorId: string;
  label: string;
  sourceRefIds?: string[];
}

export interface DecisionProblemOrigin {
  authority: 'CANONICAL' | 'LEGACY';
  primaryDetector: string;
  engineId?: string;
  triggerEventId?: string;
}

export interface UnifiedDecisionProblemActionability {
  requiresAction: boolean;
  recommendedAction?: DecisionOptionType;
  allowedActions: DecisionOptionType[];
}

export interface UnifiedDecisionProblemDebugMeta {
  authority: 'CANONICAL' | 'LEGACY';
  engineId: string;
  resolution: string;
  sourceIds: string[];
  flow?: 'CANONICAL_L2' | 'LEGACY_V15';
  route?: DecisionRouteResult;
  /** Present when includeDebug=1 and product view filters disallowed actions */
  suppressedActions?: DecisionAction[];
}

/** Left-rail queue display — legacy V1.5 + canonical L2 projection */
export interface UnifiedDecisionProblemLegacySummary {
  affectedDayNumbers: number[];
  affectedScopeSummary: string;
  categoryLabel: string;
  description?: string;
}

export interface DecisionProblemImpactScopeView {
  arrangements: Array<{ label: string; dayIndex: number }>;
}

export interface UnifiedDecisionProblemListItem {
  problemId: string;
  semanticKey: string;
  instanceKey: string;
  type: DecisionProblemType;
  dimension: DecisionDimension;
  enforcement: ConstraintEnforcement;
  phase: DecisionProblemPhase;
  affectsPlan: boolean;
  workflowStatus: DecisionProblemWorkflowStatus;
  executionStatus: DecisionProblemExecutionStatus;
  title: string;
  summary: string;
  /** Same as legacySummary.categoryLabel — top-level alias for queue UI */
  categoryLabel?: string;
  legacySummary?: UnifiedDecisionProblemLegacySummary;
  impactScopeView?: DecisionProblemImpactScopeView;
  scope: DecisionProblemScope;
  evidenceSummary: {
    count: number;
    freshness: DecisionEvidenceFreshness;
    confidence?: number;
  };
  actionability: UnifiedDecisionProblemActionability;
  occurrenceCount: number;
  occurrences?: DecisionProblemOccurrence[];
  detectors: DecisionProblemDetector[];
  origin: DecisionProblemOrigin;
  /** Canonical trace handle (travel / Iceland slice) */
  causalTraceRef?: CausalTraceReference;
  /** Workbench neutral narrative */
  causalStoryView?: CausalStoryView;
  /** Guardian Abu safety narrative — same facts/numbers as causalStoryView */
  guardianCausalStoryView?: CausalStoryView;
  debug?: UnifiedDecisionProblemDebugMeta;
}

export interface UnifiedDecisionProblemListView {
  schemaId: 'tripnara.unified_decision_problems@v2';
  tripId: string;
  generatedAt: string;
  meta: {
    total: number;
    openCount: number;
    actionableCount: number;
    occurrenceCount: number;
    byEnforcement: Partial<Record<ConstraintEnforcement, number>>;
  };
  items: UnifiedDecisionProblemListItem[];
}

export type DecisionActionCommand =
  | 'OPEN_DECISION_SPACE'
  | 'OPEN_CONSTRAINT'
  | 'OPEN_SCHEDULE_ITEM'
  | 'OPEN_PLAN_GATE';

export type DecisionWriteChain = 'EVALUATE_AUTHORIZE_EXECUTE' | 'APPLY_AND_POLL' | 'NONE';

export interface DecisionActionNavigationTarget {
  command: DecisionActionCommand;
  params: Record<string, string>;
}

export interface DecisionActionExpectedImpact {
  feasibilityDelta?: number;
  budgetDelta?: number;
  durationDelta?: number;
  affectedDays?: number[];
  affectedMembers?: string[];
}

export interface DecisionAction {
  actionId: string;
  type: DecisionOptionType;
  source: import('../../../trips/decision-semantics/types/decision-semantics.types').DecisionOptionSource;
  title: string;
  summary: string;
  expectedImpact?: DecisionActionExpectedImpact;
  requiresConfirmation: boolean;
  allowed: boolean;
  blockedReason?: string;
  navigationTarget?: DecisionActionNavigationTarget;
  /** Execution slip — structured preview (Slice 3.1) */
  executionSlipPreview?: import('../../../trips/decision-semantics/types/decision-semantics.types').ExecutionSlipRepairOptionPreview;
}

import type { CausalTraceReference } from '../../../causal-protocol/causal-trace-reference.types';
import type { CausalStoryView } from '../../../causal-protocol/causal-story-view.types';
import type { CausalTraceReplayView } from '../../../causal-protocol/causal-trace-replay.types';

export type { CausalTraceReference, CausalStoryView, CausalTraceReplayView };

export interface UnifiedDecisionProblemDetailView {
  schemaId: 'tripnara.unified_decision_problem_detail@v2';
  tripId: string;
  generatedAt: string;
  problem: UnifiedDecisionProblemListItem;
  /** Unified repair / alternative / plan-b actions (never raw repairOptions) */
  actions: DecisionAction[];
  actionability: UnifiedDecisionProblemActionability & {
    writeChain: DecisionWriteChain;
  };
  resolution?: DecisionResolutionSummary;
  negotiation?: import('../../../trips/decision-semantics/types/decision-semantics.types').DecisionProblemNegotiationView;
  /**
   * ADR-008 — OR-Tools evaluate shadow from DecisionWorkspace (product path).
   * Observational only (`shadowAuthority: false`). Present after evaluate when sidecar on.
   */
  ortoolsShadow?: import('../../solver/bridge/ortools-road-evaluate-shadow.bridge').OrtToolsEvaluateShadowAttachment;
  /** Canonical causal trace identity (v1) */
  causalTraceRef?: CausalTraceReference;
  /** Neutral narrative projection from canonical trace (P2) */
  causalStoryView?: CausalStoryView;
  /** Guardian Abu safety narrative — same trace, safety framing */
  guardianCausalStoryView?: CausalStoryView;
  debug?: UnifiedDecisionProblemDebugMeta & {
    rawLegacy?: unknown;
    rawCanonical?: unknown;
    suppressedActions?: DecisionAction[];
  };
}

export interface UnifiedDecisionOptionsView {
  schemaId: 'tripnara.unified_decision_options@v2';
  tripId: string;
  problemId: string;
  generatedAt: string;
  actions: DecisionAction[];
  actionability: UnifiedDecisionProblemActionability & {
    writeChain: DecisionWriteChain;
  };
  /** Ack strings the client must send in POST .../resolutions or accept-recommended `acknowledgement` */
  requiredAcknowledgements?: string[];
  debug?: UnifiedDecisionProblemDebugMeta & {
    suppressedActions?: DecisionAction[];
  };
}

export interface UnifiedDecisionActionPreviewView {
  schemaId: 'tripnara.unified_decision_action_preview@v2';
  tripId: string;
  problemId: string;
  actionId: string;
  generatedAt: string;
  action: DecisionAction;
  tradeoffs: import('../../../trips/decision-semantics/types/decision-semantics.types').TradeoffDimension[];
  predictedImpact?: unknown;
  proposedMutations?: unknown;
  /** feasibility/readiness repair preview 透传 — inspector planDiff 投影 SSOT */
  repairPreview?: Record<string, unknown>;
  /** Ack strings the client must send in POST .../resolutions `acknowledgement` */
  requiredAcknowledgements?: string[];
  /** Canonical causal trace identity (v1) — preview binds option to trace */
  causalTraceRef?: CausalTraceReference;
  /** Neutral narrative from canonical trace after option bind */
  causalStoryView?: CausalStoryView;
  /** Guardian Abu safety narrative — same trace as causalStoryView */
  guardianCausalStoryView?: CausalStoryView;
  debug?: UnifiedDecisionProblemDebugMeta;
}

/** Phase 3 — user/system selected resolution (scaffold) */
export interface DecisionResolutionSummary {
  resolutionId: string;
  problemId: string;
  selectedActionId: string;
  status: 'PROPOSED' | 'AUTHORIZED' | 'APPLYING' | 'APPLIED' | 'VERIFIED' | 'FAILED' | 'ROLLED_BACK';
  decidedAt?: string;
  actionPlanId?: string;
}

export interface SubmitDecisionProblemResolutionRequest {
  selectedActionId: string;
  idempotencyKey?: string;
  reason?: string;
  acknowledgement?: string[];
  /** Must match preview causalTraceRef when applying after world state change guard */
  causalTraceRef?: CausalTraceReference;
}

export interface SubmitDecisionProblemResolutionResponse {
  schemaId: 'tripnara.decision_problem_resolution_submit@v1';
  tripId: string;
  problemId: string;
  generatedAt: string;
  resolution: DecisionResolutionSummary;
  problem: {
    workflowStatus: DecisionProblemWorkflowStatus;
    executionStatus: DecisionProblemExecutionStatus;
  };
  nextStep: 'APPLY';
  collaborativeTask?: {
    negotiationTaskId: string;
    resolutionId: string;
    actionPlanId?: string | null;
  };
  /** Read-only preview — same templates as apply auto-seed; not persisted until apply */
  suggestedFollowUps?: DecisionCollaborativeFollowUpSuggestion[];
  /** Ack strings the client must collect before submit (aligned with preview authority) */
  requiredAcknowledgements?: string[];
  legacyDecision?: {
    decisionId: string;
    executionStatus?: string;
  };
  causalTraceRef?: CausalTraceReference;
}

export interface ApplyDecisionProblemResponse {
  schemaId: 'tripnara.decision_problem_apply@v1';
  tripId: string;
  problemId: string;
  generatedAt: string;
  resolution: DecisionResolutionSummary;
  problem: {
    workflowStatus: DecisionProblemWorkflowStatus;
    executionStatus: DecisionProblemExecutionStatus;
  };
  applyResult?: {
    status: string;
    message?: string;
    persisted?: boolean;
    actionPlanId?: string;
  };
  revalidation?: {
    status: 'PENDING' | 'PASSED' | 'FAILED';
    message?: string;
  };
  /** Auto-seeded on first apply when no manual sub-tasks exist */
  suggestedSubTasks?: DecisionCollaborativeSubTaskView[];
  collaborativeTask?: {
    negotiationTaskId: string;
    resolutionId: string;
    actionPlanId?: string | null;
  };
  legacyDecision?: {
    decisionId: string;
    executionStatus?: string;
    problemResolution?: unknown;
  };
  causalTraceRef?: CausalTraceReference;
}

export type DecisionProblemApplyTaskStatus =
  | 'PENDING'
  | 'APPLYING'
  | 'REVALIDATING'
  | 'READY'
  | 'FAILED';

export interface StartDecisionProblemApplyResponse {
  schemaId: 'tripnara.decision_problem_apply_accepted@v1';
  taskId: string;
  tripId: string;
  problemId: string;
  status: 'PENDING';
  pollUrl: string;
  pollIntervalMs: number;
  generatedAt: string;
  reused?: boolean;
}

export interface DecisionProblemApplyTaskResponse {
  schemaId: 'tripnara.decision_problem_apply_task@v1';
  taskId: string;
  tripId: string;
  problemId: string;
  status: DecisionProblemApplyTaskStatus;
  pollUrl: string;
  pollIntervalMs: number;
  generatedAt: string;
  result?: ApplyDecisionProblemResponse;
  error?: string;
}

export interface UnifiedDecisionCenterOverviewView {
  schemaId: 'tripnara.unified_decision_center_overview@v2';
  tripId: string;
  generatedAt: string;
  totalOpenProblemCount: number;
  resolvedProblemCount: number;
  actionableProblemCount: number;
  blockingProblemCount: number;
  waitingUserDecisionCount: number;
  waitingTeamDecisionCount: number;
  applyingCount: number;
  staleEvidenceCount: number;
  occurrenceCount: number;
  byEnforcement: Partial<Record<ConstraintEnforcement, number>>;
  headline: string;
  /** Abu safety headline from top open travel problem trace (when available) */
  guardianHeadline?: string;
  /** Abu safety assessment aligned with guardianCausalStoryView */
  guardianAssessment?: string;
  affectedDayNumbers: number[];
  problems: UnifiedDecisionProblemListItem[];
}

export interface CollaborativeTaskRef {
  problemId: string;
  resolutionId?: string;
  actionPlanId?: string;
}

export type DecisionCollaborativeSubTaskKind =
  | 'ACCOMMODATION_LOOKUP'
  | 'CANCELLATION_POLICY'
  | 'TEAM_CONFIRM'
  | 'BOOKING_FOLLOWUP'
  | 'OTHER';

export type DecisionCollaborativeSubTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface DecisionCollaborativeSubTaskView {
  id: string;
  tripId: string;
  problemId: string;
  resolutionId: string;
  actionPlanId?: string;
  kind: DecisionCollaborativeSubTaskKind;
  title: string;
  description?: string;
  status: DecisionCollaborativeSubTaskStatus;
  assigneeUserId?: string;
  problemTitle?: string;
  createdAt: string;
  createdByUserId: string;
}

export interface DecisionCollaborativeFollowUpSuggestion {
  kind: DecisionCollaborativeSubTaskKind;
  title: string;
  description?: string;
}

export interface CreateDecisionCollaborativeSubTaskRequest {
  /** Omit to bind to the active resolution for this problem */
  resolutionId?: string;
  title: string;
  description?: string;
  kind?: DecisionCollaborativeSubTaskKind;
  assigneeUserId?: string;
  problemTitle?: string;
}

export interface CreateDecisionCollaborativeSubTaskResponse {
  schemaId: 'tripnara.decision_collaborative_subtask_create@v1';
  tripId: string;
  problemId: string;
  generatedAt: string;
  subTask: DecisionCollaborativeSubTaskView;
}

export interface ListDecisionCollaborativeSubTasksResponse {
  schemaId: 'tripnara.decision_collaborative_subtasks@v1';
  tripId: string;
  problemId: string;
  generatedAt: string;
  items: DecisionCollaborativeSubTaskView[];
}

export interface UpdateDecisionCollaborativeSubTaskRequest {
  status?: DecisionCollaborativeSubTaskStatus;
  assigneeUserId?: string;
  title?: string;
  description?: string;
}

export interface UpdateDecisionCollaborativeSubTaskResponse {
  schemaId: 'tripnara.decision_collaborative_subtask_update@v1';
  tripId: string;
  problemId: string;
  generatedAt: string;
  subTask: DecisionCollaborativeSubTaskView;
}

/** FE alias — same shape as UpdateDecisionCollaborativeSubTaskRequest */
export type PatchDecisionCollaborativeSubTaskRequest = UpdateDecisionCollaborativeSubTaskRequest;

/** FE alias — same shape as UpdateDecisionCollaborativeSubTaskResponse */
export type PatchDecisionCollaborativeSubTaskResponse = UpdateDecisionCollaborativeSubTaskResponse;

export interface DeleteDecisionCollaborativeSubTaskResponse {
  schemaId: 'tripnara.decision_collaborative_subtask_delete@v1';
  tripId: string;
  problemId: string;
  subTaskId: string;
  generatedAt: string;
  deleted: boolean;
}

