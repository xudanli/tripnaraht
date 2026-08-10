/**
 * Agent Harness P0-1 W2 — page Apply surfaces return CHAIN_REQUIRED when write chain on.
 */
import { BadRequestException } from '@nestjs/common';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { PlanProposalApplyService } from './arrange-itinerary/services/plan-proposal-apply.service';
import { PlanningOrchestratorFacadeService } from './arrange-itinerary/services/planning-orchestrator-facade.service';
import { AttractionExploreAutoArrangeService } from './attraction-explore/services/attraction-explore-auto-arrange.service';
import { ScheduleConverterService } from './services/schedule-converter.service';
import { TripOptimizationService } from './services/trip-optimization.service';
import { ItineraryItemsService } from '../itinerary-items/itinerary-items.service';
import type { PlanProposal } from './arrange-itinerary/types/plan-proposal.types';

describe('page apply write chain (P0-1 W2)', () => {
  const originalChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  afterEach(() => {
    if (originalChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = originalChain;
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

  it('W2-C1: plan-proposal.apply blocked (no self-grant)', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = { tripDay: { findMany: jest.fn() }, $transaction: jest.fn() };
    const itineraryItems = { create: jest.fn(), update: jest.fn() };
    const svc = new PlanProposalApplyService(
      prisma as never,
      itineraryItems as never,
      {} as never,
      {} as never,
    );
    const proposal = {
      proposalId: 'p1',
      tripId: 't1',
      validation: { status: 'PASS', warnings: [], conflicts: [] },
      changes: [{ operation: 'ADD', dayIndex: 1 }],
    } as PlanProposal;

    await expectChainBlocked(svc.apply({ proposal, userId: 'u1' }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(itineraryItems.create).not.toHaveBeenCalled();
  });

  it('W2-C2: mutateWithMode direct blocked', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const applyDirect = jest.fn();
    const facade = new PlanningOrchestratorFacadeService(
      {} as never,
      {
        snapshot: jest.fn().mockResolvedValue({
          contextVersion: 1,
          tripId: 't1',
          dayCount: 1,
          itemCount: 0,
          fingerprint: 'fp',
        }),
        isStale: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expectChainBlocked(
      facade.mutateWithMode({
        tripId: 't1',
        userId: 'u1',
        commitMode: 'direct',
        buildProposal: async () => ({} as PlanProposal),
        applyDirect,
        mapDirect: () => ({}),
      }),
    );
    expect(applyDirect).not.toHaveBeenCalled();
  });

  it('W2-C2: mutateWithMode proposal still allowed (no durable write)', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const proposal = {
      proposalId: 'p1',
      tripId: 't1',
      validation: { status: 'PASS', warnings: [], conflicts: [] },
      changes: [],
    } as PlanProposal;
    const store = { save: jest.fn() };
    const facade = new PlanningOrchestratorFacadeService(
      store as never,
      {
        snapshot: jest.fn().mockResolvedValue({
          contextVersion: 1,
          tripId: 't1',
          dayCount: 1,
          itemCount: 0,
          fingerprint: 'fp',
        }),
        isStale: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const out = await facade.mutateWithMode({
      tripId: 't1',
      userId: 'u1',
      commitMode: 'proposal',
      buildProposal: async () => proposal,
      applyDirect: async () => {
        throw new Error('should not direct-write');
      },
      mapDirect: () => ({}),
    });
    expect(out.mode).toBe('proposal');
    expect(store.save).toHaveBeenCalled();
  });

  it('W2-C16: applyOptimization non-dryRun blocked', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = { trip: { findUnique: jest.fn() } };
    const items = { create: jest.fn(), update: jest.fn(), remove: jest.fn() };
    const svc = new TripOptimizationService(prisma as never, items as never);
    await expectChainBlocked(
      svc.applyOptimization('trip-1', {
        result: { route: [] },
        options: { dryRun: false },
      } as never),
    );
    expect(prisma.trip.findUnique).not.toHaveBeenCalled();
  });

  it('W2-C17: saveScheduleToDatabase blocked', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = {
      itineraryItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const svc = new ScheduleConverterService(prisma as never);
    await expectChainBlocked(
      svc.saveScheduleToDatabase('trip-1', 'day-1', { stops: [], metrics: {} } as never, '2026-07-01'),
    );
    expect(prisma.itineraryItem.deleteMany).not.toHaveBeenCalled();
  });

  it('W2-C2-sibling: autoArrange blocked', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = {
      tripAttractionExploreCandidate: { findMany: jest.fn() },
    };
    const svc = new AttractionExploreAutoArrangeService(prisma as never);
    await expectChainBlocked(svc.autoArrange({ tripId: 'trip-1' }));
    expect(prisma.tripAttractionExploreCandidate.findMany).not.toHaveBeenCalled();
  });

  it('W2-D1: itinerary-items create/update/remove blocked', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = {
      tripDay: { findUnique: jest.fn() },
      itineraryItem: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const svc = new ItineraryItemsService(prisma as never);

    await expectChainBlocked(
      svc.create({
        tripDayId: 'day-1',
        startTime: '2026-07-01T10:00:00.000Z',
        endTime: '2026-07-01T12:00:00.000Z',
        type: 'ACTIVITY' as never,
      }),
    );
    await expectChainBlocked(svc.update('item-1', { note: 'x' }));
    await expectChainBlocked(svc.remove('item-1'));
    expect(prisma.itineraryItem.create).not.toHaveBeenCalled();
    expect(prisma.itineraryItem.update).not.toHaveBeenCalled();
    expect(prisma.itineraryItem.delete).not.toHaveBeenCalled();
  });
});
