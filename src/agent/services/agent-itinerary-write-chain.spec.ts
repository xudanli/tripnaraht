import { BadRequestException } from '@nestjs/common';
import { createTripActions } from './actions/trip.actions';
import { System1ExecutorService } from './system1-executor.service';
import { EffectivePlanWriteGuardService } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { materializePlanStateToTimeline } from '../utils/plan-gate-timeline-materializer.util';
import { TripApplyEditSkill } from '../../skills/trip/trip-apply-edit.skill';
import { TripDeleteItemSkill } from '../../skills/trip/trip-delete-item.skill';
import {
  buildItineraryAdjustDraftApplyAnswerText,
  executeItineraryAdjustDraftApply,
} from '../utils/itinerary-adjust-draft-apply.util';
import {
  buildWriteChainBlockedUserAnswerZh,
  isWriteChainSkillBlock,
} from '../utils/write-chain-skill-block.util';

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

  it('W1-CAS-01: trip.applyEdit DB mode blocked when write chain on (no ItineraryItemsService call)', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const remove = jest.fn();
    const skill = new TripApplyEditSkill(undefined, { remove } as never);
    const out = await skill.execute({
      mode: 'db',
      tripId: 'trip-1',
      edits: [{ type: 'delete', itemId: 'item-1' }],
    });
    expect(out.success).toBe(false);
    expect(out.writeChainRequired).toBe(true);
    expect(out.degradedReason).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
    expect(isWriteChainSkillBlock(out)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('W1-CAS-02: trip.deleteItem blocked when write chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const remove = jest.fn();
    const skill = new TripDeleteItemSkill({ remove } as never);
    const out = await skill.execute({ tripId: 'trip-1', itemId: 'item-1' });
    expect(out.deleted).toBe(false);
    expect(out.writeChainRequired).toBe(true);
    expect(out.degradedReason).toBe(EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE);
    expect(isWriteChainSkillBlock(out)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('W1-CAS-03: draft-apply surfaces write_chain_blocked (does not treat as apply_failed)', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const applyEditSkill = {
      execute: jest.fn().mockResolvedValue({
        success: false,
        writeChainRequired: true,
        degradedReason: EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
      }),
    };
    const result = await executeItineraryAdjustDraftApply({
      tripId: 'trip-1',
      pending: {
        trip_id: 'trip-1',
        target_date_iso: '2026-07-01',
        target_day_number: 1,
        saved_at: '2026-07-01T00:00:00.000Z',
        request_id: 'req-1',
        itinerary_day: {
          date: '2026-07-01',
          items: [
            {
              id: 'draft-1',
              type: 'POI',
              start_window: '09:00',
              end_window: '11:00',
              location_ref: { name: '蓝湖', place_id: '42' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      },
      loadTrip: async () =>
        ({
          TripDay: [
            {
              id: 'day-1',
              date: new Date('2026-07-01T00:00:00.000Z'),
              ItineraryItem: [
                {
                  id: 'old-1',
                  type: 'ACTIVITY',
                  placeId: 99,
                  startTime: new Date('2026-07-01T10:00:00Z'),
                  endTime: new Date('2026-07-01T12:00:00Z'),
                },
              ],
            },
          ],
        }) as never,
      resolvePlaceId: () => 42,
      applyEditSkill,
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('write_chain_blocked');
    expect(result.answerText).toContain('写链已开启');
    expect(applyEditSkill.execute).toHaveBeenCalled();
  });

  it('W1-CAS-04: write-chain blocked answer copy is stable', () => {
    const text = buildItineraryAdjustDraftApplyAnswerText({
      applied: false,
      targetDateIso: '2026-07-01',
      dayNumber: 1,
      reason: 'write_chain_blocked',
    });
    expect(text).toBe(
      buildWriteChainBlockedUserAnswerZh(
        '「应用到行程」',
        '草案可保留供预览；正式落库须走确认写链。',
      ),
    );
  });
});
