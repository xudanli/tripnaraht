export type PlanningIntent =
  | 'ADD_ITEM'
  | 'PLACE_CANDIDATE'
  | 'AUTO_ARRANGE'
  | 'FILL_GAP'
  | 'OPTIMIZE_ROUTE'
  | 'ARRANGE_LUNCH'
  | 'REDUCE_INTENSITY'
  | 'INSERT_REST_GAP'
  | 'MOVE_ITEM'
  | 'REPLAN_DAY'
  | 'REPLAN_TRIP';

export type PlanProposalChangeOperation =
  | 'ADD'
  | 'MOVE'
  | 'REMOVE'
  | 'REORDER'
  | 'SWAP'
  | 'REMOVE_CANDIDATE';

export type PlanProposalValidationStatus = 'PASS' | 'WARN' | 'BLOCK';

export type PlanProposalStatus =
  | 'PREVIEW'
  | 'AWAITING_CONFIRMATION'
  | 'APPLYING'
  | 'APPLIED'
  | 'DISCARDED'
  | 'STALE'
  | 'FAILED';

export type OrchestrationPhase =
  | 'IDLE'
  | 'ANALYZING'
  | 'GENERATING'
  | 'VALIDATING'
  | 'PREVIEW'
  | 'AWAITING_CONFIRMATION'
  | 'APPLYING'
  | 'COMPLETED'
  | 'CONTEXT_STALE'
  | 'NO_FEASIBLE_PLAN'
  | 'PARTIAL_RESULT'
  | 'FAILED';

export type PlanProposalCommitMode = 'proposal' | 'direct';

export interface PlanProposalChange {
  operation: PlanProposalChangeOperation;
  itemId?: string;
  candidateId?: string;
  placeId?: number;
  dayIndex: number;
  from?: string;
  to?: string;
  startTime?: string;
  endTime?: string;
  label?: string;
  itemType?: string;
  note?: string;
  insertMode?: 'append' | 'before' | 'after';
  anchorItemId?: string;
  removeFromCandidates?: boolean;
}

export interface PlanProposalBenefits {
  drivingTimeReducedMinutes?: number;
  fatigueScoreChange?: number;
  conflictCountChange?: number;
  itemsAdded?: number;
  gapsFilled?: number;
}

export interface PlanProposalValidation {
  status: PlanProposalValidationStatus;
  warnings: string[];
  conflicts: Array<{
    kind: string;
    message: string;
    dayIndex?: number;
    itemIds?: string[];
  }>;
}

export interface PlanProposalDiffChange {
  operation: PlanProposalChangeOperation;
  label: string;
  dayIndex: number;
  from?: string;
  to?: string;
  impact: 'low' | 'medium' | 'high';
}

export interface PlanProposalDiff {
  timelineChanges: PlanProposalDiffChange[];
  summary: string;
}

export interface PlanProposalSource {
  type:
    | 'place_candidate'
    | 'create_item'
    | 'create_gap'
    | 'auto_arrange'
    | 'ai_action';
  payload: Record<string, unknown>;
}

export interface PlanProposal {
  proposalId: string;
  tripId: string;
  userId: string;
  intent: PlanningIntent;
  basePlanVersion: number;
  contextVersion: number;
  affectedDays: number[];
  changes: PlanProposalChange[];
  benefits?: PlanProposalBenefits;
  tradeoffs: string[];
  validation: PlanProposalValidation;
  diff: PlanProposalDiff;
  requiresConfirmation: boolean;
  status: PlanProposalStatus;
  answer?: string;
  createdAt: string;
  expiresAt: string;
  source: PlanProposalSource;
  /** P0/P1 决策语义包 */
  decisionPack?: import('./planning-decision-pack.types').PlanningDecisionPack;
  /**
   * ADR-008 S4 — OR-Tools OPTIMIZE_ROUTE shadow (observational only).
   * Never merges into `changes` / apply path.
   */
  ortoolsShadow?: import('../../../decision-runtime/solver/bridge/ortools-planning-orchestrator-shadow.bridge').OrtToolsPlanningShadowAttachment;
}

export interface OrchestrationStateView {
  tripId: string;
  phase: OrchestrationPhase;
  activeProposalId?: string;
  contextVersion: number;
  message?: string;
  updatedAt: string;
}

export interface PlanProposalMutationResponse {
  mode: PlanProposalCommitMode;
  orchestrationState: OrchestrationStateView;
  proposal?: PlanProposal;
  tripId: string;
  action?: string;
  answer?: string;
  suggestedActions?: Array<Record<string, unknown>>;
  itineraryItem?: Record<string, unknown>;
  scheduleTimeline?: { tripId: string; days: unknown[] };
  candidates?: unknown;
  taskId?: string;
  status?: string;
  itemCount?: number;
}

export interface PlanProposalApplyResult {
  proposalId: string;
  tripId: string;
  status: 'APPLIED';
  orchestrationState: OrchestrationStateView;
  appliedChangeCount: number;
  scheduleTimeline?: { tripId: string; days: unknown[] };
  candidates?: unknown;
  itineraryItems?: Array<Record<string, unknown>>;
  /** P1 写回后执行步骤 */
  executionSteps?: import('./planning-decision-pack.types').PlanningExecutionStep[];
  /** P1 失效监控 */
  validUntil?: string;
  monitorWebhookUrl?: string;
}
