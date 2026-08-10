/**
 * Agent Harness P0-1 W3 — Mobile / Advisory surfaces: no silent Item writes; confirm → AE only.
 */
import { BadRequestException } from '@nestjs/common';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { MobileExecutionWriteService } from '../mobile/services/mobile-execution-write.service';
import { materializeRecommendationPlanDiff } from './execution-risk-center/utils/execution-risk-active-plan-materialize.util';
import { ExecutionRiskConfirmWriteService } from './execution-risk-center/services/execution-risk-confirm-write.service';
import { assertExecutionAdvisoryDirectApplyAllowed } from './trip-constraint-solver/utils/execution-advisory-write-chain.util';

describe('mobile/advisory write chain (P0-1 W3)', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
  const originalConfirmWrite = process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
    if (originalConfirmWrite === undefined) delete process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
    else process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = originalConfirmWrite;
  });

  async function expectChainBlocked(promise: Promise<unknown>) {
    try {
      await promise;
      throw new Error('expected EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED');
    } catch (e) {
      if (e instanceof Error && e.message === 'expected EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED') {
        throw e;
      }
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
      const body = (e as BadRequestException).getResponse() as { code?: string };
      expect(body.code).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
    }
  }

  it('W3-C7: mobile.patchActivity blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = {
      itineraryItem: { findFirst: jest.fn(), update: jest.fn() },
      trip: { findUnique: jest.fn(), update: jest.fn() },
    };
    const svc = Object.create(MobileExecutionWriteService.prototype) as MobileExecutionWriteService;
    (svc as any).prisma = prisma;
    (svc as any).assertWriteHeaders = jest.fn();
    (svc as any).assertWrite = jest.fn();
    (svc as any).loadMobileMeta = jest.fn();

    await expectChainBlocked(
      svc.patchActivity(
        'trip-1',
        'user-1',
        'act-1',
        { startTime: '10:00' },
        { idempotencyKey: 'idem-1', ifMatch: 1 },
      ),
    );
    expect(prisma.itineraryItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.itineraryItem.update).not.toHaveBeenCalled();
  });

  it('W3-C9: materializeRecommendationPlanDiff blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = {
      tripDay: { findMany: jest.fn() },
      itineraryItem: { findMany: jest.fn(), update: jest.fn() },
      trip: { update: jest.fn() },
    };
    await expectChainBlocked(
      materializeRecommendationPlanDiff({
        prisma: prisma as never,
        tripId: 'trip-1',
        planDiff: { operations: [] } as never,
      }),
    );
    expect(prisma.tripDay.findMany).not.toHaveBeenCalled();
  });

  it('W3-C9: advisory direct apply assert uses CHAIN_REQUIRED code', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    try {
      assertExecutionAdvisoryDirectApplyAllowed('test.advisory');
      throw new Error('expected throw');
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
    }
  });

  it('W3-C10: confirmWrite.commitConfirmedRecommendation is not blocked by assertDirect', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
    const svc = new ExecutionRiskConfirmWriteService();
    // AE entry must run under write chain ON (no assertDirect throw)
    const result = await svc.commitConfirmedRecommendation({
      tripId: 'trip-1',
      riskId: 'risk-1',
      recommendationId: 'rec-1',
      userId: 'user-1',
      planDiff: { beforePlanVersionId: 'v0', afterPlanVersionId: 'v1', operations: [] } as never,
      idempotencyKey: 'idem-1',
    });
    expect(result).not.toBeNull();
    expect(result?.newPlanVersionId).toBeTruthy();
    expect(result?.ledgerRef).toBeTruthy();
  });
});
