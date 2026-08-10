/**
 * UNIFIED_EXECUTE AUTHORITATIVE_CANARY executor.
 * Real PlanVersion metadata transaction + PLAN_VERSION OCC.
 * WriteTarget: PlanVersion only — no Trip/ItineraryItem, ledger, problem, payment, or external SE.
 */

import type { Prisma } from '@prisma/client';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import { evaluateAtomicOccDecision } from './expected-write-version';
import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteResult,
} from './authoritative-write.types';
import { UWC_UNIFIED_CANARY_MODE } from './unified-execute-canary.config';

const VERSIONS_KEY = 'rfc001PlanVersions';
const EXECUTIONS_KEY = 'rfc001PlanVersionExecutions';
const AUDIT_KEY = 'uwcUnifiedCanaryAudit';

export type UnifiedExecuteCanaryPrisma = {
  $transaction: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
};

export type ExecuteUnifiedExecuteCanaryInput = {
  prisma: UnifiedExecuteCanaryPrisma;
  tripId: string;
  decisionId: string;
  idempotencyKey: string;
  /** Pending PlanVersion id to make EFFECTIVE (already created at finalize). */
  planVersionId: string;
  /** PLAN_VERSION OCC: expected current effective (caller-observed). */
  expectedEffectivePlanVersionId: string;
};

type PlanVersionRow = {
  planVersionId: string;
  tripId: string;
  parentPlanVersionId?: string;
  createdBy?: string;
  sourceDecisionId?: string;
  operations?: unknown[];
  materializedPlanSnapshotRef?: string;
  status: string;
  createdAt?: string;
  effectiveAt?: string;
  metadata?: Record<string, unknown>;
};

async function lockTripForUpdate(
  tx: Prisma.TransactionClient,
  tripId: string,
): Promise<void> {
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return;
  await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
}

function result(
  partial: Omit<AuthoritativeWriteResult, 'schemaId' | 'contractVersion' | 'corridor'>,
): AuthoritativeWriteResult {
  return {
    schemaId: 'tripnara.authoritative_write_result@v1',
    contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
    corridor: 'UNIFIED_EXECUTE',
    ...partial,
  };
}

export async function executeUnifiedExecuteAuthoritativeCanary(
  input: ExecuteUnifiedExecuteCanaryInput,
): Promise<AuthoritativeWriteResult> {
  try {
    const applied = await input.prisma.$transaction(async (tx) => {
      await lockTripForUpdate(tx, input.tripId);

      const trip = await tx.trip.findUnique({
        where: { id: input.tripId },
        select: { id: true, metadata: true },
      });
      if (!trip) {
        return {
          kind: 'reject' as const,
          reasonCodes: ['TRIP_NOT_FOUND'],
          errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        };
      }

      const meta = {
        ...((trip.metadata ?? {}) as Record<string, unknown>),
      };
      const versionsBlock = (meta[VERSIONS_KEY] as
        | {
            items?: PlanVersionRow[];
            effectivePlanVersionId?: string;
          }
        | undefined) ?? { items: [] };
      const items = [...(versionsBlock.items ?? [])];
      const executionsBlock = (meta[EXECUTIONS_KEY] as
        | {
            keys?: Record<
              string,
              { planVersionId: string; decisionId: string; appliedAt: string }
            >;
          }
        | undefined) ?? { keys: {} };
      const keys = { ...(executionsBlock.keys ?? {}) };

      if (keys[input.idempotencyKey]) {
        return {
          kind: 'replay' as const,
          planVersionId: keys[input.idempotencyKey].planVersionId,
        };
      }

      const observedEffective =
        versionsBlock.effectivePlanVersionId ??
        items.find((v) => v.status === 'EFFECTIVE')?.planVersionId ??
        '';

      const expectedId = input.expectedEffectivePlanVersionId || '__none__';
      const observedId = observedEffective || '__none__';

      const occ = evaluateAtomicOccDecision({
        idempotencyKey: input.idempotencyKey,
        prior: null,
        expected: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: expectedId,
        },
        observed: {
          kind: 'PLAN_VERSION',
          observedPlanVersionId: observedId,
        },
      });

      if (occ.decision === 'VERSION_CONFLICT') {
        return {
          kind: 'conflict' as const,
          reasonCodes: occ.reasonCodes,
        };
      }
      if (occ.decision !== 'PROCEED') {
        return {
          kind: 'reject' as const,
          reasonCodes: occ.reasonCodes,
          errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        };
      }

      let target = items.find((v) => v.planVersionId === input.planVersionId);
      if (!target) {
        // Atomic "create" of activate record when finalize left a pending ref only.
        target = {
          planVersionId: input.planVersionId,
          tripId: input.tripId,
          parentPlanVersionId: observedEffective || undefined,
          createdBy: 'DECISION_CORE',
          sourceDecisionId: input.decisionId,
          operations: [],
          materializedPlanSnapshotRef: `canary:${input.planVersionId}`,
          status: 'PENDING_AUTHORIZATION',
          createdAt: new Date().toISOString(),
        };
        items.push(target);
      }

      if (
        target.sourceDecisionId &&
        target.sourceDecisionId !== input.decisionId
      ) {
        return {
          kind: 'reject' as const,
          reasonCodes: ['PLAN_VERSION_DECISION_MISMATCH'],
          errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        };
      }

      if ((target.operations?.length ?? 0) > 0) {
        return {
          kind: 'reject' as const,
          reasonCodes: ['NON_EMPTY_OPERATIONS_IN_PLAN_VERSION'],
          errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        };
      }

      const now = new Date().toISOString();
      const nextItems = items.map((v) => {
        if (v.planVersionId === input.planVersionId) {
          return { ...v, status: 'EFFECTIVE', effectiveAt: now };
        }
        if (v.status === 'EFFECTIVE') {
          return { ...v, status: 'SUPERSEDED' };
        }
        return v;
      });

      keys[input.idempotencyKey] = {
        planVersionId: input.planVersionId,
        decisionId: input.decisionId,
        appliedAt: now,
      };

      const auditPrev = (meta[AUDIT_KEY] as { entries?: unknown[] } | undefined) ?? {
        entries: [],
      };
      const auditEntries = [
        ...(auditPrev.entries ?? []),
        {
          at: now,
          decisionId: input.decisionId,
          planVersionId: input.planVersionId,
          idempotencyKey: input.idempotencyKey,
          mode: UWC_UNIFIED_CANARY_MODE,
          writeTargets: ['PlanVersion'],
          dualExecution: false,
        },
      ].slice(-50);

      meta[VERSIONS_KEY] = {
        items: nextItems,
        effectivePlanVersionId: input.planVersionId,
        lastUpdatedAt: now,
      };
      meta[EXECUTIONS_KEY] = { keys };
      meta[AUDIT_KEY] = { entries: auditEntries };

      await tx.trip.update({
        where: { id: input.tripId },
        data: { metadata: toInputJsonValue(meta) },
      });

      const effective = nextItems.find(
        (v) => v.planVersionId === input.planVersionId,
      )!;
      return { kind: 'applied' as const, planVersion: effective };
    });

    if (applied.kind === 'replay') {
      return result({
        outcome: 'IDEMPOTENT_REPLAY',
        reasonCodes: ['ALREADY_APPLIED', UWC_UNIFIED_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: input.idempotencyKey,
        appliedRefs: { planVersionId: applied.planVersionId },
        corridorResult: {
          canary: true,
          dualExecution: false,
          transaction: 'none_replay',
          writeTargets: ['PlanVersion'],
        },
      });
    }
    if (applied.kind === 'conflict') {
      return result({
        outcome: 'CONFLICT',
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FRESHNESS_CONFLICT,
        reasonCodes: [...applied.reasonCodes, UWC_UNIFIED_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: input.idempotencyKey,
        corridorResult: {
          canary: true,
          dualExecution: false,
          transaction: 'aborted',
        },
      });
    }
    if (applied.kind === 'reject') {
      return result({
        outcome: 'REJECTED',
        errorCode: applied.errorCode,
        reasonCodes: [...applied.reasonCodes, UWC_UNIFIED_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: input.idempotencyKey,
        corridorResult: {
          canary: true,
          dualExecution: false,
          transaction: 'aborted',
        },
      });
    }

    return result({
      outcome: 'APPLIED',
      reasonCodes: [
        'AUTHORITATIVE_CANARY_APPLIED',
        'PLAN_VERSION_OCC',
        'DB_TRANSACTION_COMMITTED',
        'WRITE_TARGET_PLAN_VERSION_ONLY',
        'NO_MIXED_WRITE_COLLAPSE',
        'NO_DUAL_EXECUTION',
        'COMPENSATION_EXEC_AUTHORIZED',
        UWC_UNIFIED_CANARY_MODE,
      ],
      writeTargetsTouched: [
        { kind: 'plan_version', durability: 'always' },
        { kind: 'effective_plan', durability: 'always' },
      ],
      idempotencyKey: input.idempotencyKey,
      appliedRefs: { planVersionId: applied.planVersion.planVersionId },
      corridorResult: {
        canary: true,
        dualExecution: false,
        writesPerformed: true,
        writeTargets: ['PlanVersion'],
        transaction: 'committed',
        planVersion: applied.planVersion,
        mixedTargetsTouched: false,
        tripItineraryTouched: false,
      },
    });
  } catch (err) {
    // Txn aborted — technical; caller may fallback only pre-side-effect.
    throw err;
  }
}
