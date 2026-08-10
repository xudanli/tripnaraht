import {
  resolveUnifiedExecuteCanaryGate,
  UWC_UNIFIED_CANARY_CONTRACT_COMPLETE,
} from './unified-execute-canary.config';
import { admitUnifiedExecuteCanaryRequest } from './unified-execute-canary.admit';
import {
  decideUnifiedExecuteCanaryRoute,
  decideCanaryLegacyFallback,
} from './unified-execute-canary.router';
import { executeUnifiedExecuteAuthoritativeCanary } from './unified-execute-canary.executor';
import {
  advanceCutoverAfterActionsCanaryPass,
  advanceCutoverAfterItineraryCanaryPass,
  advanceCutoverAfterUnifiedCanaryPass,
  approveUnifiedExecuteForCanary,
  beginItineraryAdjustCanary,
  beginUnifiedExecuteCanary,
  isUnifiedExecuteCanaryTrafficApproved,
  UWC_CORRIDOR_CUTOVER_STATUS,
  assertNoAutoUnlockAll,
} from './corridor-cutover.gate';
import {
  UWC_1C_OCC_UNLOCKED,
  UWC_AUTHORITATIVE_DUAL_GATE_STATUS,
} from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';
import type { Prisma } from '@prisma/client';

describe('UWC-CANARY-03 UNIFIED_EXECUTE', () => {
  const tripId = 'trip-canary-03';
  const enabledEnv = {
    UWC_UNIFIED_CANARY_AUTHORIZED: '1',
    UWC_UNIFIED_CANARY_KILL_SWITCH: '0',
    UWC_UNIFIED_CANARY_PERCENT: '100',
    UWC_UNIFIED_CANARY_TRIP_ALLOWLIST: tripId,
    UWC_UNIFIED_CANARY_OP_ALLOWLIST: 'verified_plan_version_only',
  } as NodeJS.ProcessEnv;

  function resetCutoverDefaults() {
    UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = 'CANARY_IN_PROGRESS';
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
  }

  function advanceToUnifiedApprovedForCanary() {
    UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = 'CANARY_IN_PROGRESS';
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
    advanceCutoverAfterActionsCanaryPass();
    beginItineraryAdjustCanary();
    advanceCutoverAfterItineraryCanaryPass();
    approveUnifiedExecuteForCanary();
  }

  afterEach(() => {
    resetCutoverDefaults();
  });

  it('canary gate coexists with OCC + compensation unlock', () => {
    expect(UWC_UNIFIED_CANARY_CONTRACT_COMPLETE).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_AUTHORITATIVE_DUAL_GATE_STATUS.unlocked).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });

  it('blocks traffic until APPROVED_FOR_CANARY even when env authorized', () => {
    resetCutoverDefaults();
    const g = resolveUnifiedExecuteCanaryGate(enabledEnv);
    expect(g.cutoverTrafficApproved).toBe(false);
    expect(g.enabled).toBe(false);
    expect(isUnifiedExecuteCanaryTrafficApproved()).toBe(false);

    const route = decideUnifiedExecuteCanaryRoute({
      routingKey: 'k1',
      admission: {
        tripId,
        decisionId: 'd1',
        operation: 'verified_plan_version_only',
        recordStatus: 'AUTHORIZED',
        selectedCandidateId: 'original',
        operationCount: 0,
        verified: true,
      },
      env: enabledEnv,
    });
    expect(route.selectedForCanary).toBe(false);
    expect(route.reasonCodes).toContain('CUTOVER_NOT_APPROVED_FOR_CANARY');
  });

  it('admits only verified PlanVersion-only; rejects mixed / materialize / external', () => {
    const ok = admitUnifiedExecuteCanaryRequest(
      {
        tripId,
        decisionId: 'd1',
        operation: 'verified_plan_version_only',
        recordStatus: 'AUTHORIZED',
        selectedCandidateId: 'original',
        operationCount: 0,
        wouldMaterializeItinerary: false,
        hasExternalSideEffect: false,
        requiresMixedWriteTargets: false,
        verified: true,
      },
      enabledEnv,
    );
    expect(ok.admitted).toBe(true);
    expect(ok.writeTargets).toEqual(['PlanVersion']);

    const mixed = admitUnifiedExecuteCanaryRequest(
      {
        tripId,
        decisionId: 'd1',
        operation: 'verified_plan_version_only',
        recordStatus: 'AUTHORIZED',
        selectedCandidateId: 'replace_day',
        operationCount: 2,
        wouldMaterializeItinerary: true,
        requiresMixedWriteTargets: true,
        verified: true,
      },
      enabledEnv,
    );
    expect(mixed.admitted).toBe(false);
  });

  it('percent routing after APPROVED_FOR_CANARY', () => {
    advanceToUnifiedApprovedForCanary();
    expect(UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE).toBe(
      'APPROVED_FOR_CANARY',
    );
    expect(resolveUnifiedExecuteCanaryGate(enabledEnv).enabled).toBe(true);

    const selected = decideUnifiedExecuteCanaryRoute({
      routingKey: 'force-select-key',
      admission: {
        tripId,
        decisionId: 'd1',
        operation: 'verified_plan_version_only',
        recordStatus: 'AUTHORIZED',
        selectedCandidateId: 'original',
        operationCount: 0,
        verified: true,
      },
      env: enabledEnv,
    });
    expect(selected.selectedForCanary).toBe(true);
    expect(selected.mode).toBe('AUTHORITATIVE_CANARY');

    const miss = decideUnifiedExecuteCanaryRoute({
      routingKey: 'force-select-key',
      admission: {
        tripId,
        decisionId: 'd1',
        operation: 'verified_plan_version_only',
        recordStatus: 'AUTHORIZED',
        selectedCandidateId: 'original',
        operationCount: 0,
        verified: true,
      },
      env: { ...enabledEnv, UWC_UNIFIED_CANARY_PERCENT: '0' },
    });
    expect(miss.selectedForCanary).toBe(false);
    expect(miss.mode).toBe('LEGACY_WITH_SHADOW');
  });

  it('executor commits PlanVersion txn + PLAN_VERSION OCC without mixed targets', async () => {
    advanceToUnifiedApprovedForCanary();
    let meta: Record<string, unknown> = {
      rfc001PlanVersions: {
        items: [
          {
            planVersionId: 'pv_parent',
            tripId,
            status: 'EFFECTIVE',
            operations: [],
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            planVersionId: 'pv_new',
            tripId,
            parentPlanVersionId: 'pv_parent',
            sourceDecisionId: 'dec-1',
            status: 'PENDING_AUTHORIZATION',
            operations: [],
            materializedPlanSnapshotRef: 'snap-1',
            createdAt: '2026-07-24T00:00:00.000Z',
          },
        ],
        effectivePlanVersionId: 'pv_parent',
      },
    };

    const prisma = {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const tx = {
          trip: {
            findUnique: async () => ({ id: tripId, metadata: meta }),
            update: async ({
              data,
            }: {
              data: { metadata: Record<string, unknown> };
            }) => {
              meta = { ...data.metadata };
              return { id: tripId };
            },
          },
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
    };

    const applied = await executeUnifiedExecuteAuthoritativeCanary({
      prisma,
      tripId,
      decisionId: 'dec-1',
      idempotencyKey: 'idem-u-1',
      planVersionId: 'pv_new',
      expectedEffectivePlanVersionId: 'pv_parent',
    });
    expect(applied.outcome).toBe('APPLIED');
    expect(applied.corridorResult?.dualExecution).toBe(false);
    expect(applied.corridorResult?.writeTargets).toEqual(['PlanVersion']);
    expect(applied.corridorResult?.mixedTargetsTouched).toBe(false);
    expect(applied.corridorResult?.tripItineraryTouched).toBe(false);
    const block = meta.rfc001PlanVersions as {
      effectivePlanVersionId: string;
    };
    expect(block.effectivePlanVersionId).toBe('pv_new');
    expect(meta.uwcUnifiedCanaryAudit).toBeDefined();
  });

  it('OCC conflict aborts and forbids legacy fallback', async () => {
    const prisma = {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const tx = {
          trip: {
            findUnique: async () => ({
              id: tripId,
              metadata: {
                rfc001PlanVersions: {
                  items: [
                    {
                      planVersionId: 'pv_other',
                      tripId,
                      status: 'EFFECTIVE',
                      operations: [],
                    },
                  ],
                  effectivePlanVersionId: 'pv_other',
                },
              },
            }),
            update: async () => {
              throw new Error('should_not_update');
            },
          },
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
    };

    const conflict = await executeUnifiedExecuteAuthoritativeCanary({
      prisma,
      tripId,
      decisionId: 'dec-1',
      idempotencyKey: 'idem-conflict',
      planVersionId: 'pv_new',
      expectedEffectivePlanVersionId: 'pv_parent',
    });
    expect(conflict.outcome).toBe('CONFLICT');
    expect(conflict.corridorResult?.transaction).toBe('aborted');
    expect(
      decideCanaryLegacyFallback({ uwcOutcome: 'CONFLICT' }).allowLegacyFallback,
    ).toBe(false);
    expect(
      decideCanaryLegacyFallback({ uwcOutcome: 'REJECTED' }).allowLegacyFallback,
    ).toBe(false);
  });

  it('cutover: APPROVED_FOR_CANARY only after ACTIONS+ITINERARY; pass does not unlock AUTHORITATIVE', () => {
    advanceToUnifiedApprovedForCanary();
    beginUnifiedExecuteCanary();
    expect(UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE).toBe(
      'CANARY_IN_PROGRESS',
    );
    advanceCutoverAfterUnifiedCanaryPass();
    expect(UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE).toBe('CANARY_APPROVED');
    expect(() => assertNoAutoUnlockAll()).not.toThrow();
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });
});
