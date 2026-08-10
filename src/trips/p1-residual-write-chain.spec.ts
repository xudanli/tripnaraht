/**
 * Agent Harness P1 — residual mutate-existing writes blocked when write chain on.
 * Bootstrap create (trip-draft / template) intentionally ungated (no AE seed path yet).
 */
import { BadRequestException } from '@nestjs/common';
import {
  EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE,
  isEffectivePlanWriteChainBadRequest,
} from '../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { ExplorationItinerarySeederService } from './exploration/services/exploration-itinerary-seeder.service';
import { GuideTripMaterializerService } from '../guide-to-plan/services/guide-trip-materializer.service';

describe('P1 residual mutate-existing write chain', () => {
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

  it('P1: exploration.seedForSelectedRoute blocked when chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = {
      trip: { findUniqueOrThrow: jest.fn() },
      $transaction: jest.fn(),
    };
    const svc = new ExplorationItinerarySeederService(prisma as never, {
      ingestExplorationRouteSelection: jest.fn(),
    } as never);
    await expectChainBlocked(
      svc.seedForSelectedRoute({
        tripId: 'trip-1',
        strategyId: 'remote-highlands-south',
        routeId: 'r1',
        initialInput: { destinationCodes: ['IS'] } as never,
      }),
    );
    expect(prisma.trip.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('P1: guide-trip.materializeItineraryIntoTrip blocked when chain on', async () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    const prisma = {
      tripDay: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const svc = new GuideTripMaterializerService(prisma as never);
    await expectChainBlocked(
      svc.materializeItineraryIntoTrip({
        tripId: 'trip-1',
        itineraryDraft: { totalDays: 1, days: [{ items: [] }] } as never,
        travelContext: {} as never,
      }),
    );
    expect(prisma.tripDay.findMany).not.toHaveBeenCalled();
  });
});
