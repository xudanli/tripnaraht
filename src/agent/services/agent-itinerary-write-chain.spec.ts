import { BadRequestException } from '@nestjs/common';
import { createTripActions } from './actions/trip.actions';
import { System1ExecutorService } from './system1-executor.service';
import { EffectivePlanWriteGuardService } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { materializePlanStateToTimeline } from '../utils/plan-gate-timeline-materializer.util';

describe('agent itinerary write chain (pending migration complete)', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
  });

  it('CAS-117: trip.apply_user_edit returns writeChainRequired when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const guard = new EffectivePlanWriteGuardService();
    const actions = createTripActions({} as never, {} as never, guard);
    const action = actions.find((a) => a.name === 'trip.apply_user_edit');
    const result = await action!.execute(
      { trip_id: 'trip-1', edits: [{ type: 'delete', itemId: 'item-1' }] },
      {},
    );
    expect(result.success).toBe(false);
    expect(result.writeChainRequired).toBe(true);
    expect(result.error).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
  });

  it('CAS-118: System1Executor executeAPI blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const svc = new System1ExecutorService(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      new EffectivePlanWriteGuardService(),
    );
    await expect(
      (svc as any).executeAPI({
        user_input: '删除 蓝湖',
        trip: { trip_id: 'trip-1' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('CAS-119: materializePlanStateToTimeline blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    await expect(
      materializePlanStateToTimeline(
        {
          trip: { findUnique: jest.fn() },
          tripDay: { create: jest.fn() },
          itineraryItem: { deleteMany: jest.fn(), create: jest.fn() },
          $transaction: jest.fn(),
        } as any,
        {
          tripId: 'trip-1',
          planState: {
            plan_id: 'plan-1',
            itinerary: { segments: [{ segmentId: 's1', metadata: { day: 1 } }] },
          },
        } as any,
        new EffectivePlanWriteGuardService(),
      ),
    ).rejects.toThrow(BadRequestException);

    try {
      await materializePlanStateToTimeline(
        { trip: { findUnique: jest.fn() } } as any,
        { tripId: 'trip-1', planState: { plan_id: 'p1' } } as any,
        new EffectivePlanWriteGuardService(),
      );
    } catch (e) {
      expect(isEffectivePlanWriteChainBadRequest(e)).toBe(true);
    }
  });
});
