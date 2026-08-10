import {
  UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED,
  UWC_CUTOVER_01_D1_ACTIONS_APPROVED,
  UWC_CUTOVER_01_D2_ITINERARY_APPROVED,
  UWC_CUTOVER_01_D3_UNIFIED_APPROVED,
  isCorridorAuthoritativeAuthorized,
} from './corridor-authoritative.gate';
import {
  UWC_1C_OCC_UNLOCKED,
  UWC_1C_OCC_SWITCH_AUTHORIZED,
  isAuthoritativeAllowedForCorridor,
  resolveCorridorWriteMode,
} from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import type { Prisma } from '@prisma/client';

describe('UWC-CUTOVER-01 D1 ACTIONS_COMMIT', () => {
  it('approves ACTIONS; OCC + compensation unlocked (UWC-OCC/COMP-UNLOCK-01)', () => {
    expect(UWC_CUTOVER_01_D1_ACTIONS_APPROVED).toBe(true);
    expect(UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.ACTIONS_COMMIT).toBe(true);
    expect(UWC_1C_OCC_SWITCH_AUTHORIZED).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });

  it('gateway apply AUTHORITATIVE succeeds for ACTIONS', async () => {
    const registry = new AuthoritativeWriteHandlerRegistryService();
    const gateway = new AuthoritativeWriteGatewayService(registry);
    const actionsHandler = registry.get('ACTIONS_COMMIT');
    const actionsCmd = actionsHandler.buildCommand({
      trip_id: 't-d1',
      request_id: 'r-d1',
      context_signature: 'sig',
      expectedResourceVersion: 1,
      observedResourceVersion: 1,
    });
    const prev = process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
    process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = 'AUTHORITATIVE';
    try {
      expect(resolveCorridorWriteMode('ACTIONS_COMMIT').effective).toBe(
        'AUTHORITATIVE',
      );
      const out = await gateway.apply(actionsCmd);
      expect(out.outcome).toBe('APPLIED');
      expect(out.reasonCodes).toContain('UWC_CUTOVER_01_D1_ACTIONS_AUTHORITATIVE');
    } finally {
      if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
      else process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = prev;
    }
  });
});

describe('UWC-CUTOVER-01 D2 ITINERARY_ADJUST', () => {
  it('approves ITINERARY; global locks held', () => {
    expect(UWC_CUTOVER_01_D2_ITINERARY_APPROVED).toBe(true);
    expect(UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.ITINERARY_ADJUST).toBe(true);
    expect(isCorridorAuthoritativeAuthorized('ITINERARY_ADJUST')).toBe(true);
    expect(isAuthoritativeAllowedForCorridor('ITINERARY_ADJUST')).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });

  it('handler authoritativeApply commits frozen same-day time adjust via txn', async () => {
    const tripId = 't-d2';
    let tripMeta: Record<string, unknown> = { revision: 2 };
    let itemStart = new Date('2026-07-24T09:00:00.000Z');
    let itemEnd = new Date('2026-07-24T10:00:00.000Z');
    const prisma = {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const tx = {
          trip: {
            findUnique: async () => ({
              id: tripId,
              metadata: tripMeta,
              updatedAt: new Date('2026-07-24T00:00:00.000Z'),
            }),
            update: async ({
              data,
            }: {
              data: { metadata: Record<string, unknown> };
            }) => {
              tripMeta = { ...data.metadata };
              return { id: tripId };
            },
          },
          itineraryItem: {
            findUnique: async () => ({
              id: 'i1',
              isPaid: false,
              bookedAt: null,
              bookingStatus: null,
              startTime: itemStart,
              endTime: itemEnd,
            }),
            update: async ({
              data,
            }: {
              data: { startTime: Date; endTime: Date };
            }) => {
              itemStart = data.startTime;
              itemEnd = data.endTime;
              return { id: 'i1' };
            },
          },
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
    };

    const registry = new AuthoritativeWriteHandlerRegistryService();
    const handler = registry.get('ITINERARY_ADJUST');
    const cmd = handler.buildCommand({
      trip_id: tripId,
      request_id: 'r-d2',
      expectedTripRevision: 2,
      observedTripRevision: 2,
      prisma,
      timeUpdates: [
        {
          itemId: 'i1',
          startTimeIso: '2026-07-24T10:00:00.000Z',
          endTimeIso: '2026-07-24T11:00:00.000Z',
        },
      ],
    });

    const prev = process.env.UWC_CORRIDOR_MODE_ITINERARY_ADJUST;
    process.env.UWC_CORRIDOR_MODE_ITINERARY_ADJUST = 'AUTHORITATIVE';
    try {
      expect(resolveCorridorWriteMode('ITINERARY_ADJUST').effective).toBe(
        'AUTHORITATIVE',
      );
      const gateway = new AuthoritativeWriteGatewayService(registry);
      const out = await gateway.apply(cmd);
      expect(out.outcome).toBe('APPLIED');
      expect(out.reasonCodes).toContain(
        'UWC_CUTOVER_01_D2_ITINERARY_AUTHORITATIVE',
      );
      expect(out.corridorResult?.dualExecution).toBe(false);
      expect(tripMeta.revision).toBe(3);
    } finally {
      if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_ITINERARY_ADJUST;
      else process.env.UWC_CORRIDOR_MODE_ITINERARY_ADJUST = prev;
    }
  });

  it('rejects ITINERARY authoritative without prisma/timeUpdates', async () => {
    const registry = new AuthoritativeWriteHandlerRegistryService();
    const handler = registry.get('ITINERARY_ADJUST');
    const cmd = handler.buildCommand({
      trip_id: 't-d2',
      request_id: 'r-d2-missing',
      expectedTripRevision: 1,
      observedTripRevision: 1,
    });
    const out = await handler.authoritativeApply(cmd);
    expect(out.outcome).toBe('REJECTED');
    expect(out.reasonCodes).toContain(
      'ITINERARY_AUTHORITATIVE_REQUIRES_PRISMA_AND_TIME_UPDATES',
    );
  });
});

describe('UWC-CUTOVER-01 D3 UNIFIED_EXECUTE PlanVersion-only', () => {
  it('approves UNIFIED PlanVersion-only; OCC + compensation unlocked', () => {
    expect(UWC_CUTOVER_01_D3_UNIFIED_APPROVED).toBe(true);
    expect(UWC_CORRIDOR_AUTHORITATIVE_AUTHORIZED.UNIFIED_EXECUTE).toBe(true);
    expect(isCorridorAuthoritativeAuthorized('UNIFIED_EXECUTE')).toBe(true);
    expect(isAuthoritativeAllowedForCorridor('UNIFIED_EXECUTE')).toBe(true);
    expect(isAuthoritativeAllowedForCorridor('ACTIONS_COMMIT')).toBe(true);
    expect(isAuthoritativeAllowedForCorridor('ITINERARY_ADJUST')).toBe(true);
    expect(UWC_1C_OCC_SWITCH_AUTHORIZED).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });

  it('handler authoritativeApply commits PlanVersion OCC via txn', async () => {
    const tripId = 't-d3';
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
            sourceDecisionId: 'dec-d3',
            status: 'PENDING_AUTHORIZATION',
            operations: [],
            materializedPlanSnapshotRef: 'snap-d3',
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

    const registry = new AuthoritativeWriteHandlerRegistryService();
    const handler = registry.get('UNIFIED_EXECUTE');
    const cmd = handler.buildCommand({
      tripId,
      decisionId: 'dec-d3',
      expectedPlanVersionId: 'pv_parent',
      observedPlanVersionId: 'pv_parent',
      planVersionId: 'pv_new',
      prisma,
      idempotencyKey: 'idem-d3',
    });

    const prev = process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE;
    process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE = 'AUTHORITATIVE';
    try {
      expect(resolveCorridorWriteMode('UNIFIED_EXECUTE').effective).toBe(
        'AUTHORITATIVE',
      );
      expect(resolveCorridorWriteMode('UNIFIED_EXECUTE').authoritativeHardBlocked).toBe(
        false,
      );
      const gateway = new AuthoritativeWriteGatewayService(registry);
      const out = await gateway.apply(cmd);
      expect(out.outcome).toBe('APPLIED');
      expect(out.reasonCodes).toContain('UWC_CUTOVER_01_D3_UNIFIED_AUTHORITATIVE');
      expect(out.reasonCodes).toContain('WRITE_TARGET_PLAN_VERSION_ONLY');
      expect(out.corridorResult?.dualExecution).toBe(false);
      expect(out.corridorResult?.mixedTargetsTouched).toBe(false);
      expect(out.corridorResult?.cutoverDecision).toBe('D3');
      const block = meta.rfc001PlanVersions as { effectivePlanVersionId: string };
      expect(block.effectivePlanVersionId).toBe('pv_new');
    } finally {
      if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE;
      else process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE = prev;
    }
  });

  it('rejects UNIFIED authoritative without prisma/decision/planVersion', async () => {
    const registry = new AuthoritativeWriteHandlerRegistryService();
    const handler = registry.get('UNIFIED_EXECUTE');
    const cmd = handler.buildCommand({
      tripId: 't-d3',
      decisionId: 'dec-missing',
      expectedPlanVersionId: 'pv_parent',
      observedPlanVersionId: 'pv_parent',
    });
    const out = await handler.authoritativeApply(cmd);
    expect(out.outcome).toBe('REJECTED');
    expect(out.reasonCodes).toContain(
      'UNIFIED_AUTHORITATIVE_REQUIRES_PRISMA_DECISION_PLAN_VERSION',
    );
  });
});
