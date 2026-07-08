import { BadRequestException } from '@nestjs/common';
import { TripPlannerService } from './trip-planner.service';
import { EffectivePlanWriteGuardService } from '../../../../decision-runtime/execution/effective-plan-write-guard.service';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

describe('TripPlannerService write chain', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
  });

  const service = () =>
    new TripPlannerService(
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new EffectivePlanWriteGuardService(),
    );

  it('CAS-106: applySuggestion blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    await expect(
      service().applySuggestion(
        {
          tripId: 'trip-1',
          sessionId: 'sess-1',
          suggestionId: 'sug-1',
          targetDay: 1,
          suggestionType: 'add_place',
          place: { name: 'Test Place' },
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);

    try {
      await service().applySuggestion(
        {
          tripId: 'trip-1',
          sessionId: 'sess-1',
          suggestionId: 'sug-1',
          targetDay: 1,
          suggestionType: 'add_place',
          place: { name: 'Test Place' },
        },
        'user-1',
      );
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
      const body = (e as BadRequestException).getResponse() as { code?: string; caller?: string };
      expect(body.code).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
      expect(body.caller).toBe('TripPlannerService.applySuggestion');
    }
  });

  it('CAS-107: fixNightActivities blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    await expect(
      service().fixNightActivities({
        tripId: 'trip-1',
        sessionId: 'sess-1',
        userId: 'user-1',
      }),
    ).rejects.toThrow(BadRequestException);

    try {
      await service().fixNightActivities({
        tripId: 'trip-1',
        sessionId: 'sess-1',
        userId: 'user-1',
      });
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
      const body = (e as BadRequestException).getResponse() as { caller?: string };
      expect(body.caller).toBe('TripPlannerService.fixNightActivities');
    }
  });
});
