/**
 * Apply cutover reconciliation — preserves recordStatus; semantic state in cutoverReconciliation.
 * Never maps stale auth to REJECTED_BY_USER.
 */

import type { PrismaClient } from '@prisma/client';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import {
  AUTHORIZATION_RECONCILIATION_SCHEMA_ID,
  preconditionsMet,
  resolveReconciliationSpec,
  type AuthorizationReconciliationReport,
  type InflightRecordClassificationReport,
  type ReconcileConflict,
  type ReconcilePlanItem,
  type ReconcileScope,
} from './production-cutover-inflight-classification.catalog';

const RECONCILIATION_META_KEY = 'rfc001CutoverReconciliation';

export function buildReconcilePlan(
  classification: InflightRecordClassificationReport,
  scope: ReconcileScope,
): ReconcilePlanItem[] {
  const items: ReconcilePlanItem[] = [];

  for (const d of classification.decisionRuns) {
    if (d.reconciliationApplied || d.reconcileScope !== scope) continue;
    const spec = resolveReconciliationSpec(d.recommendedAction);
    if (!spec) continue;
    items.push({
      entityType: 'decision',
      entityId: d.decisionId,
      tripId: d.tripId,
      decisionRunId: d.decisionRunId,
      expectedPreviousStatus: d.recordStatus,
      targetReconciliationStatus: spec.semanticStatus,
      targetReconciliationReason: spec.reason,
      reconcileScope: scope,
      action: d.recommendedAction,
      applyPreconditions: d.applyPreconditions,
      missingLinks: [],
    });
  }

  if (scope === 'authorizations') {
    for (const a of classification.authorizations) {
      if (a.reconciliationApplied || a.reconcileScope !== scope) continue;
      const spec = resolveReconciliationSpec(a.recommendedAction);
      if (!spec) continue;
      items.push({
        entityType: 'authorization',
        entityId: a.authorizationId,
        tripId: a.tripId,
        decisionRunId: a.decisionRunId,
        expectedPreviousStatus: a.recordStatus,
        targetReconciliationStatus: spec.semanticStatus,
        targetReconciliationReason: spec.reason,
        reconcileScope: scope,
        action: a.recommendedAction,
        applyPreconditions: a.applyPreconditions,
        missingLinks: a.missingLinks,
      });
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.tripId}:${item.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function applyInflightReconciliation(input: {
  prisma: PrismaClient;
  classification: InflightRecordClassificationReport;
  operator: string;
  dryRun: boolean;
  scope: ReconcileScope;
  sourceRuntime?: string;
}): Promise<AuthorizationReconciliationReport> {
  const sourceRuntime = input.sourceRuntime ?? 'LEGACY';
  const reconciledAt = new Date().toISOString();
  const plan = buildReconcilePlan(input.classification, input.scope);
  const conflicts: ReconcileConflict[] = [];
  const items: AuthorizationReconciliationReport['items'] = [];

  for (const target of plan) {
    const live = await readLiveRecord(input.prisma, target.tripId, target.entityId);

    if (!live) {
      conflicts.push({
        entityId: target.entityId,
        tripId: target.tripId,
        code: 'RECORD_NOT_FOUND',
        detail: 'Ledger record missing at apply time',
      });
      continue;
    }

    if (live.reconciliationApplied) {
      conflicts.push({
        entityId: target.entityId,
        tripId: target.tripId,
        code: 'ALREADY_RECONCILED',
        detail: `Already reconciled as ${live.reconciliationStatus}`,
      });
      continue;
    }

    if (live.recordStatus !== target.expectedPreviousStatus) {
      conflicts.push({
        entityId: target.entityId,
        tripId: target.tripId,
        code: 'STATUS_MISMATCH',
        detail: `expected ${target.expectedPreviousStatus} got ${live.recordStatus}`,
      });
      continue;
    }

    const livePre = {
      hasActiveWorker: live.hasExecutionLock,
      hasValidLease: false,
      hasExecutionInProgress: live.recordStatus === 'EXECUTING',
      hasEffectivePlanApplied: live.hasEffectivePlan,
      hasUnresolvedPartialFailure: ['PARTIAL', 'NEEDS_REPAIR', 'FAILED'].includes(
        live.recordStatus,
      ),
    };

    if (!preconditionsMet(livePre)) {
      conflicts.push({
        entityId: target.entityId,
        tripId: target.tripId,
        code: 'PRECONDITION_FAILED',
        detail: JSON.stringify(livePre),
      });
      continue;
    }

    const item = {
      entityType: target.entityType,
      entityId: target.entityId,
      tripId: target.tripId,
      expectedPreviousStatus: target.expectedPreviousStatus,
      recordStatusPreserved: live.recordStatus,
      targetReconciliationStatus: target.targetReconciliationStatus,
      targetReconciliationReason: target.targetReconciliationReason,
      decisionRunId: target.decisionRunId,
      hadEffectivePlan: live.hasEffectivePlan,
      hadExecutionLock: live.hasExecutionLock,
      operator: input.operator,
      reconciledAt,
      sourceRuntime,
      applied: false,
    };

    if (!input.dryRun) {
      const updated = await reconcileTripRecord(input.prisma, {
        tripId: target.tripId,
        decisionId: target.entityId,
        expectedPreviousStatus: target.expectedPreviousStatus,
        recordStatusPreserved: live.recordStatus,
        semanticStatus: target.targetReconciliationStatus,
        reason: target.targetReconciliationReason,
        operator: input.operator,
        reconciledAt,
        sourceRuntime,
        decisionRunId: target.decisionRunId,
        hadEffectivePlan: live.hasEffectivePlan,
        hadExecutionLock: live.hasExecutionLock,
        missingLinks: target.missingLinks,
      });
      if (!updated) {
        conflicts.push({
          entityId: target.entityId,
          tripId: target.tripId,
          code: 'STATUS_MISMATCH',
          detail: 'Optimistic update failed — status changed during apply',
        });
        continue;
      }
      item.applied = true;
    }

    items.push(item);
  }

  const pass = conflicts.length === 0;

  return {
    schemaId: AUTHORIZATION_RECONCILIATION_SCHEMA_ID,
    generatedAt: reconciledAt,
    operator: input.operator,
    dryRun: input.dryRun,
    scope: input.scope,
    items,
    conflicts,
    pass,
  };
}

interface LiveRecordSnapshot {
  recordStatus: string;
  hasEffectivePlan: boolean;
  hasExecutionLock: boolean;
  reconciliationApplied: boolean;
  reconciliationStatus: string | null;
}

async function readLiveRecord(
  prisma: PrismaClient,
  tripId: string,
  decisionId: string,
): Promise<LiveRecordSnapshot | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) return null;
  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const ledger = meta.rfc001DecisionLedger as { items?: Array<Record<string, unknown>> };
  const record = ledger?.items?.find((d) => d.decisionId === decisionId);
  if (!record) return null;
  const locks = (meta.rfc001ExecutionLocks ?? {}) as Record<string, unknown>;
  const recon = record.cutoverReconciliation as Record<string, unknown> | undefined;
  return {
    recordStatus: String(record.recordStatus ?? 'UNKNOWN'),
    hasEffectivePlan: Boolean(record.effectivePlanVersionId),
    hasExecutionLock: Boolean(locks[decisionId]),
    reconciliationApplied: Boolean(recon?.status),
    reconciliationStatus: recon?.status ? String(recon.status) : null,
  };
}

async function reconcileTripRecord(
  prisma: PrismaClient,
  input: {
    tripId: string;
    decisionId: string;
    expectedPreviousStatus: string;
    recordStatusPreserved: string;
    semanticStatus: string;
    reason: string;
    operator: string;
    reconciledAt: string;
    sourceRuntime: string;
    decisionRunId: string | null;
    hadEffectivePlan: boolean;
    hadExecutionLock: boolean;
    missingLinks: string[];
  },
): Promise<boolean> {
  const trip = await prisma.trip.findUnique({
    where: { id: input.tripId },
    select: { metadata: true },
  });
  if (!trip) return false;

  const meta = { ...((trip.metadata ?? {}) as Record<string, unknown>) };
  const ledger = (meta.rfc001DecisionLedger as { items?: Array<Record<string, unknown>> }) ?? {
    items: [],
  };
  const items = [...(ledger.items ?? [])];
  const idx = items.findIndex((d) => d.decisionId === input.decisionId);
  if (idx < 0) return false;

  const previous = items[idx];
  const previousStatus = String(previous.recordStatus ?? 'UNKNOWN');
  if (previousStatus !== input.expectedPreviousStatus) {
    return false;
  }

  items[idx] = {
    ...previous,
    recordStatus: input.recordStatusPreserved,
    cutoverReconciliation: {
      status: input.semanticStatus,
      reason: input.reason,
      previousStatus,
      recordStatusPreserved: input.recordStatusPreserved,
      executable: false,
      decisionRunId: input.decisionRunId,
      hadEffectivePlan: input.hadEffectivePlan,
      hadExecutionLock: input.hadExecutionLock,
      missingLinks: input.missingLinks,
      operator: input.operator,
      reconciledAt: input.reconciledAt,
      sourceRuntime: input.sourceRuntime,
    },
  };

  const locks = { ...((meta.rfc001ExecutionLocks ?? {}) as Record<string, unknown>) };
  if (locks[input.decisionId]) {
    delete locks[input.decisionId];
  }

  const reconLog = (meta[RECONCILIATION_META_KEY] as { items?: unknown[] }) ?? { items: [] };
  const reconItems = [
    ...(reconLog.items ?? []),
    {
      entityType: 'decision',
      entityId: input.decisionId,
      previousStatus,
      recordStatusPreserved: input.recordStatusPreserved,
      targetReconciliationStatus: input.semanticStatus,
      targetReconciliationReason: input.reason,
      operator: input.operator,
      reconciledAt: input.reconciledAt,
      sourceRuntime: input.sourceRuntime,
    },
  ];

  await prisma.trip.update({
    where: { id: input.tripId },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        rfc001DecisionLedger: { ...ledger, items, lastUpdatedAt: input.reconciledAt },
        rfc001ExecutionLocks: locks,
        [RECONCILIATION_META_KEY]: { items: reconItems, lastUpdatedAt: input.reconciledAt },
      }),
    },
  });

  return true;
}
