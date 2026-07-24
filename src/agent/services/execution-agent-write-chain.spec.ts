import { BadRequestException } from '@nestjs/common';
import { ExecutionAgentService } from './execution-agent.service';
import { EffectivePlanWriteGuardService } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

describe('ExecutionAgentService write chain', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
  });

  const service = () =>
    new ExecutionAgentService(
      undefined,
      undefined,
      undefined,
      { findByTripDay: jest.fn() } as any,
      { itineraryItem: { update: jest.fn() }, tripDay: { findUnique: jest.fn() }, $transaction: jest.fn() } as any,
      new EffectivePlanWriteGuardService(),
    );

  it('CAS-104: reorder blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    await expect(
      service().reorder({
        tripId: 'trip-1',
        dayId: 'day-1',
        newOrder: ['item-1'],
      }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service().reorder({
        tripId: 'trip-1',
        dayId: 'day-1',
        newOrder: ['item-1'],
      });
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
      const body = (e as BadRequestException).getResponse() as { code?: string; caller?: string };
      expect(body.code).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
      expect(body.caller).toBe('ExecutionAgentService.reorder');
    }
  });

  it('CAS-105: applyFallback blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    await expect(
      service().applyFallback({
        tripId: 'trip-1',
        solutionId: 'sol-1',
      }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service().applyFallback({
        tripId: 'trip-1',
        solutionId: 'sol-1',
      });
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
      const body = (e as BadRequestException).getResponse() as { caller?: string };
      expect(body.caller).toBe('ExecutionAgentService.applyFallback');
    }
  });
});
