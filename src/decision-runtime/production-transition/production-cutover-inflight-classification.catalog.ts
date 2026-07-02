/**
 * Cutover inflight record classification — read-only triage before reconciliation.
 */

export const INFLIGHT_CLASSIFICATION_SCHEMA_ID =
  'tripnara.production_cutover_inflight_classification@v1';

export const AUTHORIZATION_RECONCILIATION_SCHEMA_ID =
  'tripnara.production_cutover_authorization_reconciliation@v2';

export type ReconcileScope = 'authorizations' | 'stale-test-proposals';

export type DecisionRunClassification =
  | 'TRULY_ACTIVE'
  | 'STALE_NON_TERMINAL'
  | 'AWAITING_HUMAN'
  | 'TEST_STALE_PROPOSAL'
  | 'TERMINAL'
  | 'RECONCILED';

export type AuthorizationClassification =
  | 'PENDING_EXECUTABLE'
  | 'STALE_AUTHORIZED'
  | 'ORPHANED'
  | 'ORPHANED_RECONCILED'
  | 'NOT_EXECUTABLE'
  | 'TERMINAL';

export type ReconcileAction =
  | 'WAIT_COMPLETE'
  | 'SAFE_CANCEL'
  | 'MARK_FAILED_STALE'
  | 'MARK_EXPIRED'
  | 'MARK_INVALID_ORPHANED'
  | 'MARK_CANCELLED_TEST_DATA'
  | 'MARK_REQUIRES_REEVALUATION'
  | 'NO_ACTION'
  | 'LEDGER_CORRECT_TO_EXECUTED';

/** Semantic status in cutoverReconciliation — not RFC001 recordStatus. */
export const RECONCILIATION_SEMANTIC_STATUS = {
  EXPIRED: 'EXPIRED',
  INVALID_ORPHANED: 'INVALID_ORPHANED',
  CANCELLED_TEST_DATA: 'CANCELLED_TEST_DATA',
  REQUIRES_REEVALUATION: 'REQUIRES_REEVALUATION',
} as const;

export const RECONCILIATION_REASON = {
  STALE_AUTHORIZATION_BEFORE_RUNTIME_CUTOVER:
    'STALE_AUTHORIZATION_BEFORE_RUNTIME_CUTOVER',
  ORPHANED_AUTHORIZATION_MISSING_DECISION_RUN:
    'ORPHANED_AUTHORIZATION_MISSING_DECISION_RUN',
  TEST_DATA_CLEANUP_BEFORE_RUNTIME_CUTOVER:
    'TEST_DATA_CLEANUP_BEFORE_RUNTIME_CUTOVER',
  REEVALUATION_REQUIRED_AFTER_RUNTIME_CUTOVER:
    'REEVALUATION_REQUIRED_AFTER_RUNTIME_CUTOVER',
} as const;

export const TERMINAL_DECISION_STATUSES = new Set([
  'EFFECTIVE',
  'FAILED',
  'ROLLED_BACK',
  'REJECTED_BY_USER',
  'CANCELLED',
]);

export const INFLIGHT_DECISION_STATUSES = new Set([
  'EXECUTING',
  'RUNNING',
  'DISPATCHING',
  'EVALUATING',
  'FINALIZING',
  'AUTHORIZING',
]);

export const DEFAULT_STALE_DECISION_HOURS = 48;

export interface ReconcileApplyPreconditions {
  hasActiveWorker: boolean;
  hasValidLease: boolean;
  hasExecutionInProgress: boolean;
  hasEffectivePlanApplied: boolean;
  hasUnresolvedPartialFailure: boolean;
}

export interface ClassifiedDecisionRun {
  tripId: string;
  decisionId: string;
  decisionRunId: string | null;
  recordStatus: string;
  authLevel: string | null;
  decidedAt: string | null;
  createdAt: string | null;
  lastUpdatedAt: string | null;
  activeLease: boolean;
  activeWorker: boolean;
  hasExecutionLock: boolean;
  hasLinkedRun: boolean;
  hasAuthorization: boolean;
  hasEffectivePlan: boolean;
  effectivePlanVersionId: string | null;
  canWriteEffectivePlan: boolean;
  executable: boolean;
  sourceHint: string;
  classification: DecisionRunClassification;
  recommendedAction: ReconcileAction;
  reconcileScope: ReconcileScope | null;
  targetReconciliationStatus: string | null;
  targetReconciliationReason: string | null;
  applyPreconditions: ReconcileApplyPreconditions;
  blocksCutover: boolean;
  reconciliationApplied: boolean;
  notes: string[];
}

export interface ClassifiedAuthorization {
  authorizationId: string;
  tripId: string;
  decisionId: string;
  recordStatus: string;
  decisionRecordExists: boolean;
  decisionRunId: string | null;
  expired: boolean;
  executable: boolean;
  hasEffectivePlan: boolean;
  hasExecutionLock: boolean;
  missingLinks: string[];
  classification: AuthorizationClassification;
  recommendedAction: ReconcileAction;
  reconcileScope: ReconcileScope | null;
  targetReconciliationStatus: string | null;
  targetReconciliationReason: string | null;
  applyPreconditions: ReconcileApplyPreconditions;
  blocksCutover: boolean;
  reconciliationApplied: boolean;
  notes: string[];
}

export interface InflightRecordClassificationReport {
  schemaId: typeof INFLIGHT_CLASSIFICATION_SCHEMA_ID;
  classifiedAt: string;
  operator: string;
  staleThresholdHours: number;
  summary: {
    decisionRunsTotal: number;
    trulyActive: number;
    staleNonTerminal: number;
    awaitingHuman: number;
    testStaleProposals: number;
    blocksCutoverDecisionRuns: number;
    pendingExecutableAuthorizations: number;
    orphanAuthorizations: number;
    blocksCutoverAuthorizations: number;
  };
  decisionRuns: ClassifiedDecisionRun[];
  authorizations: ClassifiedAuthorization[];
  nextSteps: string[];
}

export interface ReconcilePlanItem {
  entityType: 'decision' | 'authorization';
  entityId: string;
  tripId: string;
  decisionRunId: string | null;
  expectedPreviousStatus: string;
  targetReconciliationStatus: string;
  targetReconciliationReason: string;
  reconcileScope: ReconcileScope;
  action: ReconcileAction;
  applyPreconditions: ReconcileApplyPreconditions;
  missingLinks: string[];
}

export interface ReconcileConflict {
  entityId: string;
  tripId: string;
  code:
    | 'STATUS_MISMATCH'
    | 'PRECONDITION_FAILED'
    | 'RECORD_NOT_FOUND'
    | 'ALREADY_RECONCILED';
  detail: string;
}

export interface AuthorizationReconciliationReport {
  schemaId: typeof AUTHORIZATION_RECONCILIATION_SCHEMA_ID;
  generatedAt: string;
  operator: string;
  dryRun: boolean;
  scope: ReconcileScope | 'all';
  items: Array<{
    entityType: 'decision' | 'authorization';
    entityId: string;
    tripId: string;
    expectedPreviousStatus: string;
    recordStatusPreserved: string;
    targetReconciliationStatus: string;
    targetReconciliationReason: string;
    decisionRunId: string | null;
    hadEffectivePlan: boolean;
    hadExecutionLock: boolean;
    operator: string;
    reconciledAt: string;
    sourceRuntime: string;
    applied: boolean;
    skipped?: boolean;
    conflict?: ReconcileConflict;
  }>;
  conflicts: ReconcileConflict[];
  pass: boolean;
}

export function resolveReconciliationSpec(action: ReconcileAction): {
  semanticStatus: string;
  reason: string;
} | null {
  switch (action) {
    case 'MARK_EXPIRED':
      return {
        semanticStatus: RECONCILIATION_SEMANTIC_STATUS.EXPIRED,
        reason: RECONCILIATION_REASON.STALE_AUTHORIZATION_BEFORE_RUNTIME_CUTOVER,
      };
    case 'MARK_INVALID_ORPHANED':
      return {
        semanticStatus: RECONCILIATION_SEMANTIC_STATUS.INVALID_ORPHANED,
        reason: RECONCILIATION_REASON.ORPHANED_AUTHORIZATION_MISSING_DECISION_RUN,
      };
    case 'MARK_CANCELLED_TEST_DATA':
      return {
        semanticStatus: RECONCILIATION_SEMANTIC_STATUS.CANCELLED_TEST_DATA,
        reason: RECONCILIATION_REASON.TEST_DATA_CLEANUP_BEFORE_RUNTIME_CUTOVER,
      };
    case 'MARK_REQUIRES_REEVALUATION':
      return {
        semanticStatus: RECONCILIATION_SEMANTIC_STATUS.REQUIRES_REEVALUATION,
        reason: RECONCILIATION_REASON.REEVALUATION_REQUIRED_AFTER_RUNTIME_CUTOVER,
      };
    default:
      return null;
  }
}

export function buildApplyPreconditions(input: {
  recordStatus: string;
  hasExecutionLock: boolean;
  hasEffectivePlan: boolean;
}): ReconcileApplyPreconditions {
  return {
    hasActiveWorker: Boolean(input.hasExecutionLock),
    hasValidLease: false,
    hasExecutionInProgress: input.recordStatus === 'EXECUTING',
    hasEffectivePlanApplied: input.hasEffectivePlan,
    hasUnresolvedPartialFailure: ['PARTIAL', 'NEEDS_REPAIR', 'FAILED'].includes(
      input.recordStatus,
    ),
  };
}

export function preconditionsMet(p: ReconcileApplyPreconditions): boolean {
  return (
    !p.hasActiveWorker &&
    !p.hasValidLease &&
    !p.hasExecutionInProgress &&
    !p.hasEffectivePlanApplied &&
    !p.hasUnresolvedPartialFailure
  );
}
