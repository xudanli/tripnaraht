/**
 * Pre-cutover inflight clearance — prove no work can still mutate Effective Plan.
 *
 * Principle: not just "no RUNNING rows in DB" — no active write path remains.
 */

import type { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const INFLIGHT_CLEARANCE_SCHEMA_ID = 'tripnara.production_cutover_inflight_clearance@v2';

export const ACTIVE_DECISION_RUN_STATUSES = [
  'RUNNING',
  'DISPATCHING',
  'EVALUATING',
  'FINALIZING',
  'AUTHORIZING',
  'EXECUTING',
] as const;

export const ACTIVE_EXECUTOR_STATUSES = [
  'EXECUTION_RUNNING',
  'COMMIT_PENDING',
  'MATERIALIZATION_RUNNING',
  'COMPENSATION_PENDING',
  'PARTIAL_FAILURE_UNRESOLVED',
] as const;

export const ACTIVE_ROLLBACK_STATUSES = [
  'ROLLBACK_PENDING',
  'ROLLBACK_RUNNING',
  'ROLLBACK_FAILED_UNRESOLVED',
] as const;

const ACTIVE_BENCHMARK_RUN_STATUSES = ['CREATED', 'RUNNING', 'PAUSED'] as const;
const ACTIVE_BENCHMARK_INSTANCE_STATUSES = [
  'PENDING',
  'RUNNING',
  'AUTHORITY_COMPLETED',
  'SHADOW_COMPLETED',
  'REVIEW_MATERIALIZED',
  'RETRYABLE_FAILED',
] as const;

/** Required overlay fields — each must have auditable evidence when not DB-queried. */
export const REQUIRED_OVERLAY_FIELDS = [
  'activeDecisionRuns',
  'pausedDecisionRuns',
  'pausedDecisionRunsAcknowledged',
  'pendingAuthorizations',
  'expiredButExecutableAuthorizations',
  'orphanAuthorizations',
  'activeExecutions',
  'activeRollbacks',
  'unresolvedPartialFailures',
  'activeWriteLeases',
  'pendingQueueWriteJobs',
  'effectivePlanWritesLast5Minutes',
  'planVersionsCreatedLast5Minutes',
  'executeRequestsLast5Minutes',
] as const;

export type RequiredOverlayField = (typeof REQUIRED_OVERLAY_FIELDS)[number];

export interface InflightOverlayEvidence {
  value: number | boolean;
  source: string;
  checkedAt: string;
  checkedBy: string;
  evidence: string;
  /** When true, operator confirms PAUSED runs will not auto-resume or write after restart. */
  acknowledged?: boolean;
}

export type InflightOverlayFile = Partial<Record<RequiredOverlayField, InflightOverlayEvidence>>;

export interface InflightClearanceSection {
  id: string;
  label: string;
  count: number;
  queried: boolean;
  source: 'database' | 'overlay' | 'unqueried';
  detail: string;
  blockers: string[];
}

export interface AuthorizationInflightSummary {
  pendingAuthorizations: number;
  expiredButExecutableAuthorizations: number;
  orphanAuthorizations: number;
}

export interface InflightClearanceReport {
  schemaId: typeof INFLIGHT_CLEARANCE_SCHEMA_ID;
  checkedAt: string;
  operator: string;
  activeDecisionRuns: number;
  pausedDecisionRuns: number;
  pausedDecisionRunsAcknowledged: boolean;
  authorization: AuthorizationInflightSummary;
  pendingAuthorizations: number;
  activeExecutions: number;
  activeRollbacks: number;
  unresolvedPartialFailures: number;
  activeLeases: number;
  pendingQueueWriteJobs: number;
  activeBenchmarkRuns: number;
  effectivePlanWritesLast5Minutes: number;
  planVersionsCreatedLast5Minutes: number;
  executeRequestsLast5Minutes: number;
  overlayFields: RequiredOverlayField[];
  missingOverlayFields: RequiredOverlayField[];
  /** @alias missingOverlayFields */
  missingOverlayEvidence: RequiredOverlayField[];
  overlayEvidenceInvalid: string[];
  ready: boolean;
  blockers: string[];
  sections: InflightClearanceSection[];
  notes: string[];
  principle: string;
  /** Reconcile artifacts that explain why historical records no longer block cutover. */
  reconciliationArtifacts?: {
    authorizationReconciliation?: string;
    staleTestProposalReconciliation?: string;
    inflightRecordClassification?: string;
  };
}

export interface CollectInflightClearanceInput {
  prisma?: PrismaClient | null;
  root?: string;
  operator?: string;
  overlay?: InflightOverlayFile;
}

function readOverlayFile(root: string): InflightOverlayFile | undefined {
  const overlayPath = path.join(root, 'artifacts/production-cutover/inflight-overlay.json');
  if (!existsSync(overlayPath)) return undefined;
  try {
    return JSON.parse(readFileSync(overlayPath, 'utf8')) as InflightOverlayFile;
  } catch {
    return undefined;
  }
}

function discoverReconciliationArtifacts(root: string): InflightClearanceReport['reconciliationArtifacts'] {
  const base = path.join(root, 'artifacts/production-cutover');
  const paths = {
    authorizationReconciliation: path.join(base, 'authorization-reconciliation.json'),
    staleTestProposalReconciliation: path.join(base, 'stale-test-proposal-reconciliation.json'),
    inflightRecordClassification: path.join(base, 'inflight-record-classification.json'),
  };
  const out: NonNullable<InflightClearanceReport['reconciliationArtifacts']> = {};
  if (existsSync(paths.authorizationReconciliation)) {
    out.authorizationReconciliation = paths.authorizationReconciliation;
  }
  if (existsSync(paths.staleTestProposalReconciliation)) {
    out.staleTestProposalReconciliation = paths.staleTestProposalReconciliation;
  }
  if (existsSync(paths.inflightRecordClassification)) {
    out.inflightRecordClassification = paths.inflightRecordClassification;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isValidEvidence(entry: InflightOverlayEvidence | undefined): entry is InflightOverlayEvidence {
  if (!entry) return false;
  const hasCore =
    (typeof entry.value === 'number' || typeof entry.value === 'boolean') &&
    typeof entry.source === 'string' &&
    entry.source.length > 0 &&
    typeof entry.checkedAt === 'string' &&
    entry.checkedAt.length > 0 &&
    typeof entry.checkedBy === 'string' &&
    entry.checkedBy.length > 0 &&
    typeof entry.evidence === 'string' &&
    entry.evidence.length >= 8;

  if (!hasCore) return false;

  // Reject bare "manual" — must be auditable (sql:/queue-query:/metrics:/runbook:/not-applicable:)
  if (entry.source === 'manual') return false;

  const auditableEvidence =
    /^(sql:|queue-query:|metrics:|runbook:|not-applicable:)/.test(entry.evidence) ||
    entry.evidence.includes('query:') ||
    entry.evidence.includes('dashboard:');

  return auditableEvidence;
}

function overlayNumber(
  overlay: InflightOverlayFile | undefined,
  field: RequiredOverlayField,
): { value: number; queried: boolean; evidence?: InflightOverlayEvidence } {
  const entry = overlay?.[field];
  if (!isValidEvidence(entry)) {
    return { value: -1, queried: false };
  }
  const value = typeof entry.value === 'boolean' ? (entry.value ? 1 : 0) : entry.value;
  return { value, queried: true, evidence: entry };
}

function overlayBoolean(
  overlay: InflightOverlayFile | undefined,
  field: RequiredOverlayField,
): { value: boolean; queried: boolean } {
  const entry = overlay?.[field];
  if (!isValidEvidence(entry) || typeof entry.value !== 'boolean') {
    return { value: false, queried: false };
  }
  return { value: entry.value, queried: true };
}

async function countBenchmarkInflight(prisma: PrismaClient): Promise<{
  activeBenchmarkRuns: number;
  activeBenchmarkLeases: number;
  detail: string;
}> {
  const now = new Date();
  const [activeRuns, activeInstances, activeLeases] = await Promise.all([
    prisma.decisionBenchmarkRun.count({
      where: { status: { in: [...ACTIVE_BENCHMARK_RUN_STATUSES] } },
    }),
    prisma.decisionBenchmarkInstanceExecution.count({
      where: { status: { in: [...ACTIVE_BENCHMARK_INSTANCE_STATUSES] } },
    }),
    prisma.decisionBenchmarkInstanceExecution.count({
      where: {
        lockedBy: { not: null },
        leaseExpiresAt: { gt: now },
      },
    }),
  ]);
  return {
    activeBenchmarkRuns: activeRuns,
    activeBenchmarkLeases: activeLeases,
    detail: `runs=${activeRuns} activeInstances=${activeInstances} unexpiredLeases=${activeLeases}`,
  };
}

export async function collectInflightClearance(
  input: CollectInflightClearanceInput = {},
): Promise<InflightClearanceReport> {
  const root = input.root ?? process.cwd();
  const operator = input.operator?.trim() || process.env.CUTOVER_OPERATOR?.trim() || 'unspecified';
  const overlay = { ...readOverlayFile(root), ...input.overlay };
  const sections: InflightClearanceSection[] = [];
  const notes: string[] = [];
  const blockers: string[] = [];
  const overlayFields: RequiredOverlayField[] = [];
  const missingOverlayFields: RequiredOverlayField[] = [];
  const overlayEvidenceInvalid: string[] = [];

  for (const field of REQUIRED_OVERLAY_FIELDS) {
    const entry = overlay?.[field];
    if (isValidEvidence(entry)) {
      overlayFields.push(field);
    } else if (entry) {
      overlayEvidenceInvalid.push(field);
    } else {
      missingOverlayFields.push(field);
    }
  }

  let activeBenchmarkRuns = -1;
  let dbBenchmarkLeases = -1;

  if (input.prisma) {
    try {
      const bench = await countBenchmarkInflight(input.prisma);
      activeBenchmarkRuns = bench.activeBenchmarkRuns;
      dbBenchmarkLeases = bench.activeBenchmarkLeases;
      sections.push({
        id: 'benchmark',
        label: 'Benchmark / calibration runs (DB)',
        count: activeBenchmarkRuns,
        queried: true,
        source: 'database',
        detail: bench.detail,
        blockers: activeBenchmarkRuns > 0 ? ['benchmark'] : [],
      });
      if (activeBenchmarkRuns > 0) blockers.push('benchmark');
      if (dbBenchmarkLeases > 0) {
        sections.push({
          id: 'benchmark-lease',
          label: 'Benchmark unexpired write leases (DB)',
          count: dbBenchmarkLeases,
          queried: true,
          source: 'database',
          detail: 'Unexpired benchmark instance leases held by workers',
          blockers: ['benchmark-lease'],
        });
        blockers.push('benchmark-lease');
      }
    } catch (err) {
      notes.push(`benchmark DB query failed: ${(err as Error).message}`);
    }
  } else {
    notes.push('DATABASE_URL unavailable — benchmark counts from DB skipped');
  }

  const decisionRuns = overlayNumber(overlay, 'activeDecisionRuns');
  const pausedRuns = overlayNumber(overlay, 'pausedDecisionRuns');
  const pausedAck = overlayBoolean(overlay, 'pausedDecisionRunsAcknowledged');
  const pendingAuth = overlayNumber(overlay, 'pendingAuthorizations');
  const expiredAuth = overlayNumber(overlay, 'expiredButExecutableAuthorizations');
  const orphanAuth = overlayNumber(overlay, 'orphanAuthorizations');
  const activeExec = overlayNumber(overlay, 'activeExecutions');
  const activeRollback = overlayNumber(overlay, 'activeRollbacks');
  const partialFail = overlayNumber(overlay, 'unresolvedPartialFailures');
  const writeLeases = overlayNumber(overlay, 'activeWriteLeases');
  const queueJobs = overlayNumber(overlay, 'pendingQueueWriteJobs');
  const epWrites = overlayNumber(overlay, 'effectivePlanWritesLast5Minutes');
  const planVersions = overlayNumber(overlay, 'planVersionsCreatedLast5Minutes');
  const executeReqs = overlayNumber(overlay, 'executeRequestsLast5Minutes');

  const metricRows: Array<{
    id: string;
    label: string;
    count: number;
    queried: boolean;
    source: InflightClearanceSection['source'];
    detail: string;
    blockerId: string;
  }> = [
    {
      id: 'decision-runs',
      label: 'Active Decision Runs',
      count: decisionRuns.value,
      queried: decisionRuns.queried,
      source: 'overlay',
      detail: `Must be 0 — no ${ACTIVE_DECISION_RUN_STATUSES.join('/')}`,
      blockerId: 'decision-runs',
    },
    {
      id: 'paused-runs',
      label: 'PAUSED Decision Runs (manual ack required if >0)',
      count: pausedRuns.value,
      queried: pausedRuns.queried,
      source: 'overlay',
      detail: 'Confirm no auto-resume / no Effective Plan writes after restart',
      blockerId: 'paused-runs-unacknowledged',
    },
    {
      id: 'authorization-pending',
      label: 'Pending authorizations',
      count: pendingAuth.value,
      queried: pendingAuth.queried,
      source: 'overlay',
      detail: 'No authorized-but-unexecuted high-risk decisions or commit-waiting auth',
      blockerId: 'authorization',
    },
    {
      id: 'authorization-expired',
      label: 'Expired but still executable authorizations',
      count: expiredAuth.value,
      queried: expiredAuth.queried,
      source: 'overlay',
      detail: 'Must be 0',
      blockerId: 'authorization-expired',
    },
    {
      id: 'authorization-orphan',
      label: 'Orphan authorizations',
      count: orphanAuth.value,
      queried: orphanAuth.queried,
      source: 'overlay',
      detail: 'No authorization without DecisionRecord',
      blockerId: 'authorization-orphan',
    },
    {
      id: 'executor',
      label: 'Active executor operations',
      count: activeExec.value,
      queried: activeExec.queried,
      source: 'overlay',
      detail: `Must be 0 — no ${ACTIVE_EXECUTOR_STATUSES.join('/')}`,
      blockerId: 'executor',
    },
    {
      id: 'rollback',
      label: 'Active rollbacks',
      count: activeRollback.value,
      queried: activeRollback.queried,
      source: 'overlay',
      detail: `Must be 0 — no ${ACTIVE_ROLLBACK_STATUSES.join('/')}`,
      blockerId: 'rollback',
    },
    {
      id: 'partial-failure',
      label: 'Unresolved partial failures',
      count: partialFail.value,
      queried: partialFail.queried,
      source: 'overlay',
      detail: 'Cannot overlay-force 0 if rollback/execute partially failed',
      blockerId: 'partial-failure',
    },
    {
      id: 'write-leases',
      label: 'Active unexpired write leases',
      count: writeLeases.value,
      queried: writeLeases.queried,
      source: 'overlay',
      detail: 'Decision/Benchmark/Monitoring/Replan/Worker write leases — unexpired only',
      blockerId: 'write-leases',
    },
    {
      id: 'queue-write-jobs',
      label: 'Claimed-but-unacked queue write jobs',
      count: queueJobs.value,
      queried: queueJobs.queried,
      source: 'overlay',
      detail: 'Plan write / Canonical execute / Legacy execute / Replan / Rollback / Materialize / Benchmark',
      blockerId: 'queue-write-jobs',
    },
    {
      id: 'effective-plan-writes',
      label: 'Effective Plan writes (last 5 min)',
      count: epWrites.value,
      queried: epWrites.queried,
      source: 'overlay',
      detail: 'Maintenance silence window — must be 0',
      blockerId: 'effective-plan-writes',
    },
    {
      id: 'plan-versions',
      label: 'PlanVersion created (last 5 min)',
      count: planVersions.value,
      queried: planVersions.queried,
      source: 'overlay',
      detail: 'Maintenance silence window — must be 0',
      blockerId: 'plan-versions',
    },
    {
      id: 'execute-requests',
      label: 'Execute requests (last 5 min)',
      count: executeReqs.value,
      queried: executeReqs.queried,
      source: 'overlay',
      detail: 'Maintenance silence window — must be 0',
      blockerId: 'execute-requests',
    },
  ];

  for (const row of metricRows) {
    const sectionBlockers: string[] = [];
    if (!row.queried) {
      notes.push(`${row.label}: missing auditable overlay — artifacts/production-cutover/inflight-overlay.json`);
    } else if (row.id === 'paused-runs') {
      if (row.count > 0 && !pausedAck.queried) {
        sectionBlockers.push('paused-runs-unacknowledged');
        blockers.push('paused-runs-unacknowledged');
      } else if (row.count > 0 && !pausedAck.value) {
        sectionBlockers.push('paused-runs-unacknowledged');
        blockers.push('paused-runs-unacknowledged');
        notes.push('PAUSED runs > 0 — set pausedDecisionRunsAcknowledged.value=true with evidence');
      }
    } else if (row.count > 0) {
      sectionBlockers.push(row.blockerId);
      blockers.push(row.blockerId);
    }

    sections.push({
      id: row.id,
      label: row.label,
      count: Math.max(row.count, 0),
      queried: row.queried,
      source: row.queried ? row.source : 'unqueried',
      detail: row.detail,
      blockers: sectionBlockers,
    });
  }

  if (activeBenchmarkRuns < 0) {
    notes.push(
      'activeBenchmarkRuns not queried from DB — confirm no Calibration/Holdout/Shadow batch via ops checklist',
    );
  }

  const allOverlayPresent = missingOverlayFields.length === 0 && overlayEvidenceInvalid.length === 0;
  const benchmarkOk =
    !input.prisma ||
    ((activeBenchmarkRuns === 0 || activeBenchmarkRuns < 0) &&
      (dbBenchmarkLeases === 0 || dbBenchmarkLeases < 0));
  const allCountsZero =
    metricRows.every((r) => !r.queried || r.count === 0 || (r.id === 'paused-runs' && r.count === 0)) &&
    benchmarkOk &&
    (activeBenchmarkRuns < 0 || activeBenchmarkRuns === 0) &&
    (dbBenchmarkLeases < 0 || dbBenchmarkLeases === 0);

  const pausedOk =
    pausedRuns.value <= 0 ||
    (pausedRuns.queried && pausedAck.queried && pausedAck.value && pausedRuns.value >= 0);

  const ready =
    allOverlayPresent &&
    allCountsZero &&
    pausedOk &&
    [...new Set(blockers)].length === 0;

  const authSummary: AuthorizationInflightSummary = {
    pendingAuthorizations: Math.max(pendingAuth.value, 0),
    expiredButExecutableAuthorizations: Math.max(expiredAuth.value, 0),
    orphanAuthorizations: Math.max(orphanAuth.value, 0),
  };

  const totalWriteLeases =
    (writeLeases.queried ? writeLeases.value : 0) +
    (dbBenchmarkLeases > 0 ? dbBenchmarkLeases : 0);

  const reconciliationArtifacts = discoverReconciliationArtifacts(root);
  if (reconciliationArtifacts) {
    notes.push(
      'Historical inflight records reconciled — see reconciliationArtifacts for audit trail',
    );
  }

  return {
    schemaId: INFLIGHT_CLEARANCE_SCHEMA_ID,
    checkedAt: new Date().toISOString(),
    operator,
    activeDecisionRuns: Math.max(decisionRuns.value, 0),
    pausedDecisionRuns: Math.max(pausedRuns.value, 0),
    pausedDecisionRunsAcknowledged: pausedAck.value,
    authorization: authSummary,
    pendingAuthorizations: authSummary.pendingAuthorizations,
    activeExecutions: Math.max(activeExec.value, 0),
    activeRollbacks: Math.max(activeRollback.value, 0),
    unresolvedPartialFailures: Math.max(partialFail.value, 0),
    activeLeases: totalWriteLeases,
    pendingQueueWriteJobs: Math.max(queueJobs.value, 0),
    activeBenchmarkRuns: Math.max(activeBenchmarkRuns, 0),
    effectivePlanWritesLast5Minutes: Math.max(epWrites.value, 0),
    planVersionsCreatedLast5Minutes: Math.max(planVersions.value, 0),
    executeRequestsLast5Minutes: Math.max(executeReqs.value, 0),
    overlayFields,
    missingOverlayFields,
    missingOverlayEvidence: missingOverlayFields,
    overlayEvidenceInvalid,
    ready,
    blockers: [...new Set(blockers)],
    sections,
    notes,
    principle: 'No work remains that can still mutate Effective Plan',
    reconciliationArtifacts,
  };
}
