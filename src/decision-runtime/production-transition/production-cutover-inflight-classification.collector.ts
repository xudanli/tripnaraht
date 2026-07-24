/**
 * Read-only classification of inflight Decision Runs and Authorizations (trip.metadata RFC001).
 */

import type { PrismaClient } from '@prisma/client';
import {
  AUTHORIZATION_RECONCILIATION_SCHEMA_ID,
  DEFAULT_STALE_DECISION_HOURS,
  INFLIGHT_CLASSIFICATION_SCHEMA_ID,
  INFLIGHT_DECISION_STATUSES,
  TERMINAL_DECISION_STATUSES,
  buildApplyPreconditions,
  resolveReconciliationSpec,
  type AuthorizationClassification,
  type ClassifiedAuthorization,
  type ClassifiedDecisionRun,
  type DecisionRunClassification,
  type InflightRecordClassificationReport,
  type ReconcileAction,
  type ReconcileScope,
} from './production-cutover-inflight-classification.catalog';

const RECONCILIATION_META_KEY = 'rfc001CutoverReconciliation';

interface RawLedgerRow {
  trip_id: string;
  decision_id: string;
  record_status: string;
  decided_at: string | null;
  created_at: string | null;
  auth_level: string | null;
  effective_plan_version_id: string | null;
  problem_id: string | null;
  workspace_id: string | null;
  ledger_updated_at: string | null;
  has_run: boolean;
  run_id: string | null;
  run_created_at: string | null;
  has_execution_lock: boolean;
  lock_locked_at: string | null;
  reconciliation_status: string | null;
  reconciliation_executable: boolean | null;
  trip_updated_at: Date | null;
}

function hoursSince(iso: string | null, nowMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (nowMs - t) / (60 * 60 * 1000);
}

function inferSourceHint(decisionId: string, tripId: string): string {
  if (decisionId.includes('benchmark') || decisionId.includes('bench_')) return 'benchmark';
  if (decisionId.includes('smoke') || decisionId.includes('e2e')) return 'smoke';
  if (tripId.startsWith('test-') || decisionId.includes('harness')) return 'test';
  return 'production-or-dev';
}

function classifyDecisionRun(
  row: RawLedgerRow,
  staleHours: number,
  nowMs: number,
): ClassifiedDecisionRun {
  const notes: string[] = [];
  const reconciliationApplied = row.reconciliation_status != null;
  const hasEffectivePlan = Boolean(row.effective_plan_version_id);
  const lastUpdatedAt =
    row.ledger_updated_at ?? row.decided_at ?? row.run_created_at ?? row.lock_locked_at;
  const ageHours = hoursSince(lastUpdatedAt, nowMs);

  const activeLease = false;
  const activeWorker = row.has_execution_lock;
  const hasExecutionLock = Boolean(row.has_execution_lock);

  let classification: DecisionRunClassification = 'STALE_NON_TERMINAL';
  let recommendedAction: ReconcileAction = 'MARK_FAILED_STALE';
  let reconcileScope: ReconcileScope | null = null;
  let canWriteEffectivePlan = false;
  let executable = false;

  if (TERMINAL_DECISION_STATUSES.has(row.record_status)) {
    classification = 'TERMINAL';
    recommendedAction = 'NO_ACTION';
  } else if (reconciliationApplied && row.reconciliation_executable === false) {
    classification = 'RECONCILED';
    recommendedAction = 'NO_ACTION';
    notes.push(`reconciled=${row.reconciliation_status}`);
  } else if (
    row.record_status === 'EXECUTING' ||
    INFLIGHT_DECISION_STATUSES.has(row.record_status)
  ) {
    if (hasExecutionLock || ageHours < 1) {
      classification = 'TRULY_ACTIVE';
      recommendedAction = 'WAIT_COMPLETE';
      canWriteEffectivePlan = true;
      executable = true;
    } else {
      classification = 'STALE_NON_TERMINAL';
      recommendedAction = 'SAFE_CANCEL';
      notes.push('EXECUTING without recent lock — treat as stale');
    }
  } else if (row.record_status === 'PROPOSED') {
    if (row.auth_level === 'L2' && !hasExecutionLock) {
      classification = 'TEST_STALE_PROPOSAL';
      recommendedAction = 'MARK_CANCELLED_TEST_DATA';
      reconcileScope = 'stale-test-proposals';
      notes.push(
        'PROPOSED L2 historical/test — terminate before cutover; not user rejection',
      );
    } else if (hasExecutionLock) {
      classification = 'TRULY_ACTIVE';
      recommendedAction = 'WAIT_COMPLETE';
      canWriteEffectivePlan = true;
    } else if (ageHours >= staleHours) {
      classification = 'STALE_NON_TERMINAL';
      recommendedAction = 'MARK_FAILED_STALE';
    } else {
      classification = 'AWAITING_HUMAN';
      recommendedAction = 'MARK_REQUIRES_REEVALUATION';
      reconcileScope = 'stale-test-proposals';
    }
  } else if (row.record_status === 'AUTHORIZED' && !hasEffectivePlan) {
    if (hasExecutionLock && ageHours < staleHours) {
      classification = 'TRULY_ACTIVE';
      recommendedAction = 'WAIT_COMPLETE';
      canWriteEffectivePlan = true;
      executable = true;
    } else {
      classification = 'STALE_NON_TERMINAL';
      recommendedAction = 'MARK_EXPIRED';
      reconcileScope = 'authorizations';
      notes.push('AUTHORIZED but unexecuted — EXPIRED before Canonical cutover (not user rejection)');
    }
  } else {
    classification = 'TERMINAL';
    recommendedAction = 'NO_ACTION';
  }

  const blocksCutover =
    !reconciliationApplied &&
    (classification === 'TRULY_ACTIVE' || classification === 'STALE_NON_TERMINAL');

  const spec = resolveReconciliationSpec(recommendedAction);
  const applyPreconditions = buildApplyPreconditions({
    recordStatus: row.record_status,
    hasExecutionLock,
    hasEffectivePlan,
  });

  return {
    tripId: row.trip_id,
    decisionId: row.decision_id,
    decisionRunId: row.run_id,
    recordStatus: row.record_status,
    authLevel: row.auth_level,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    lastUpdatedAt,
    activeLease,
    activeWorker: hasExecutionLock,
    hasExecutionLock,
    hasLinkedRun: row.has_run,
    hasAuthorization: row.record_status === 'AUTHORIZED',
    hasEffectivePlan,
    effectivePlanVersionId: row.effective_plan_version_id,
    canWriteEffectivePlan,
    executable,
    sourceHint: inferSourceHint(row.decision_id, row.trip_id),
    classification,
    recommendedAction,
    reconcileScope,
    targetReconciliationStatus: spec?.semanticStatus ?? null,
    targetReconciliationReason: spec?.reason ?? null,
    applyPreconditions,
    blocksCutover,
    reconciliationApplied,
    notes,
  };
}

function classifyAuthorization(
  row: RawLedgerRow,
  staleHours: number,
  nowMs: number,
): ClassifiedAuthorization | null {
  if (!['AUTHORIZED', 'PROPOSED'].includes(row.record_status)) return null;

  const missingLinks: string[] = [];
  if (!row.has_run) missingLinks.push('decisionRunId');
  if (!row.problem_id) missingLinks.push('problemId');
  if (!row.workspace_id) missingLinks.push('workspaceId');

  const ageHours = hoursSince(row.decided_at, nowMs);
  const expired = ageHours >= staleHours;
  const hasEffectivePlan = Boolean(row.effective_plan_version_id);
  const reconciliationApplied = row.reconciliation_status != null;

  let classification: AuthorizationClassification = 'NOT_EXECUTABLE';
  let recommendedAction: ReconcileAction = 'NO_ACTION';
  const notes: string[] = [];

  if (reconciliationApplied) {
    classification = row.reconciliation_status === 'INVALID_ORPHANED'
      ? 'ORPHANED_RECONCILED'
      : 'NOT_EXECUTABLE';
    recommendedAction = 'NO_ACTION';
  } else if (!row.has_run) {
    classification = 'ORPHANED';
    recommendedAction = 'MARK_INVALID_ORPHANED';
    notes.push('No matching rfc001DecisionRuns entry');
  } else if (row.record_status === 'AUTHORIZED' && !hasEffectivePlan) {
    if (row.has_execution_lock && !expired) {
      classification = 'PENDING_EXECUTABLE';
      recommendedAction = 'WAIT_COMPLETE';
      notes.push('Has execution lock — may still execute');
    } else {
      classification = 'STALE_AUTHORIZED';
      recommendedAction = 'MARK_EXPIRED';
      notes.push('Stale AUTHORIZED — EXPIRED before cutover');
    }
  } else if (row.record_status === 'PROPOSED') {
    classification = 'NOT_EXECUTABLE';
    recommendedAction = 'NO_ACTION';
    notes.push('PROPOSED is not an executable authorization');
  } else {
    classification = 'TERMINAL';
    recommendedAction = 'NO_ACTION';
  }

  const executable =
    !reconciliationApplied &&
    classification === 'PENDING_EXECUTABLE' &&
    !expired &&
    !hasEffectivePlan;

  const blocksCutover =
    !reconciliationApplied &&
    (classification === 'PENDING_EXECUTABLE' ||
      classification === 'STALE_AUTHORIZED' ||
      classification === 'ORPHANED');

  const reconcileScope: ReconcileScope | null =
    recommendedAction === 'MARK_EXPIRED' || recommendedAction === 'MARK_INVALID_ORPHANED'
      ? 'authorizations'
      : null;

  const spec = resolveReconciliationSpec(recommendedAction);
  const applyPreconditions = buildApplyPreconditions({
    recordStatus: row.record_status,
    hasExecutionLock: Boolean(row.has_execution_lock),
    hasEffectivePlan,
  });

  return {
    authorizationId: row.decision_id,
    tripId: row.trip_id,
    decisionId: row.decision_id,
    recordStatus: row.record_status,
    decisionRecordExists: true,
    decisionRunId: row.run_id,
    expired,
    executable,
    hasEffectivePlan,
    hasExecutionLock: Boolean(row.has_execution_lock),
    missingLinks,
    classification,
    recommendedAction,
    reconcileScope,
    targetReconciliationStatus: spec?.semanticStatus ?? null,
    targetReconciliationReason: spec?.reason ?? null,
    applyPreconditions,
    blocksCutover,
    reconciliationApplied,
    notes,
  };
}

const CLASSIFICATION_SQL = `
SELECT
  t.id AS trip_id,
  rec->>'decisionId' AS decision_id,
  rec->>'recordStatus' AS record_status,
  rec->>'decidedAt' AS decided_at,
  rec->>'createdAt' AS created_at,
  rec->'authorizationRequirement'->>'level' AS auth_level,
  rec->>'effectivePlanVersionId' AS effective_plan_version_id,
  rec->>'problemId' AS problem_id,
  rec->>'workspaceId' AS workspace_id,
  t.metadata->'rfc001DecisionLedger'->>'lastUpdatedAt' AS ledger_updated_at,
  (run.run IS NOT NULL) AS has_run,
  run.run->>'runId' AS run_id,
  run.run->>'createdAt' AS run_created_at,
  (t.metadata->'rfc001ExecutionLocks' ? (rec->>'decisionId')) AS has_execution_lock,
  t.metadata->'rfc001ExecutionLocks'->(rec->>'decisionId')->>'lockedAt' AS lock_locked_at,
  rec->'cutoverReconciliation'->>'status' AS reconciliation_status,
  (rec->'cutoverReconciliation'->>'executable')::boolean AS reconciliation_executable,
  t."updatedAt" AS trip_updated_at
FROM "Trip" t
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(t.metadata->'rfc001DecisionLedger'->'items', '[]'::jsonb)
) AS rec
LEFT JOIN LATERAL (
  SELECT r AS run
  FROM jsonb_array_elements(COALESCE(t.metadata->'rfc001DecisionRuns'->'items', '[]'::jsonb)) r
  WHERE r->>'decisionId' = rec->>'decisionId'
  LIMIT 1
) run ON true
WHERE rec->>'recordStatus' NOT IN ('EFFECTIVE', 'FAILED', 'ROLLED_BACK', 'REJECTED_BY_USER')
ORDER BY rec->>'decidedAt' DESC NULLS LAST
`;

export async function classifyInflightRecords(input: {
  prisma: PrismaClient;
  operator?: string;
  staleThresholdHours?: number;
}): Promise<InflightRecordClassificationReport> {
  const operator = input.operator?.trim() || process.env.CUTOVER_OPERATOR?.trim() || 'unspecified';
  const staleThresholdHours =
    input.staleThresholdHours ??
    Number(process.env.CUTOVER_STALE_DECISION_HOURS ?? DEFAULT_STALE_DECISION_HOURS);
  const nowMs = Date.now();

  const rows = await input.prisma.$queryRawUnsafe<RawLedgerRow[]>(CLASSIFICATION_SQL);

  const decisionRuns = rows.map((r) => classifyDecisionRun(r, staleThresholdHours, nowMs));
  const authorizations = rows
    .map((r) => classifyAuthorization(r, staleThresholdHours, nowMs))
    .filter((a): a is ClassifiedAuthorization => a != null)
    .filter(
      (a, idx, arr) => arr.findIndex((x) => x.authorizationId === a.authorizationId) === idx,
    );

  const summary = {
    decisionRunsTotal: decisionRuns.length,
    trulyActive: decisionRuns.filter((d) => d.classification === 'TRULY_ACTIVE').length,
    staleNonTerminal: decisionRuns.filter((d) => d.classification === 'STALE_NON_TERMINAL').length,
    awaitingHuman: decisionRuns.filter((d) => d.classification === 'AWAITING_HUMAN').length,
    testStaleProposals: decisionRuns.filter((d) => d.classification === 'TEST_STALE_PROPOSAL')
      .length,
    blocksCutoverDecisionRuns: decisionRuns.filter((d) => d.blocksCutover).length,
    pendingExecutableAuthorizations: authorizations.filter(
      (a) => a.classification === 'PENDING_EXECUTABLE',
    ).length,
    orphanAuthorizations: authorizations.filter((a) => a.classification === 'ORPHANED').length,
    blocksCutoverAuthorizations: authorizations.filter((a) => a.blocksCutover).length,
  };

  const nextSteps: string[] = [];
  if (summary.blocksCutoverDecisionRuns > 0 || summary.blocksCutoverAuthorizations > 0) {
    nextSteps.push(
      'npm run production-cutover:inflight-reconcile -- --dry-run --scope authorizations',
    );
    nextSteps.push(
      'npm run production-cutover:inflight-reconcile -- --apply --scope authorizations',
    );
    nextSteps.push(
      'npm run production-cutover:inflight-reconcile -- --apply --scope stale-test-proposals',
    );
    nextSteps.push('npm run production-cutover:inflight-db-probe');
  } else {
    nextSteps.push('Proceed to maintenance window → inflight-db-probe → inflight-clearance');
  }

  return {
    schemaId: INFLIGHT_CLASSIFICATION_SCHEMA_ID,
    classifiedAt: new Date().toISOString(),
    operator,
    staleThresholdHours,
    summary,
    decisionRuns,
    authorizations,
    nextSteps,
  };
}

export { AUTHORIZATION_RECONCILIATION_SCHEMA_ID, INFLIGHT_CLASSIFICATION_SCHEMA_ID };
