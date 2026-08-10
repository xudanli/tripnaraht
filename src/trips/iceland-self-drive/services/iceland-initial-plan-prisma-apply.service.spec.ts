import { BadRequestException } from '@nestjs/common';
import { IcelandInitialPlanPrismaApplyService } from './iceland-initial-plan-prisma-apply.service';
import type { TripShell } from '../types/iceland-trip-shell-preview.types';

function shell(overrides: Partial<TripShell> = {}): TripShell {
  return {
    tripId: 'trip_test_prisma_01',
    ownerId: 'user-1',
    lifecycle: 'PLANNING',
    creationStatus: 'PREVIEW_CONFIRMED',
    destinationCode: 'IS',
    travelDates: { startDate: '2027-07-10', endDate: '2027-07-12' },
    contextVersion: 1,
    contextHash: 'abc',
    contextPayload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('IcelandInitialPlanPrismaApplyService', () => {
  it('creates Trip + TripDays + ItineraryItems when trip missing', async () => {
    const createdItems: any[] = [];
    const prisma = {
      place: {
        findMany: jest.fn(async () => [{ id: 381037 }, { id: 381038 }]),
      },
      $transaction: jest.fn(async (fn: any) => {
        const tx = {
          trip: {
            findUnique: jest.fn(async () => null),
            create: jest.fn(async ({ data }: any) => ({
              id: data.id,
              metadata: data.metadata,
            })),
            update: jest.fn(async () => ({})),
          },
          tripDay: {
            findMany: jest.fn(async () => []),
            create: jest.fn(async ({ data }: any) => ({
              id: data.id,
              date: data.date,
            })),
          },
          tripCollaborator: {
            findUnique: jest.fn(async () => null),
            create: jest.fn(async () => ({})),
          },
          itineraryItem: {
            create: jest.fn(async ({ data }: any) => {
              createdItems.push(data);
              return data;
            }),
          },
        };
        return fn(tx);
      }),
    };

    const svc = new IcelandInitialPlanPrismaApplyService(prisma as any);
    const result = await svc.materialize({
      shell: shell(),
      ownerId: 'user-1',
      planVersionId: 'pv_1',
      proposal: {
        proposalId: 'prop_1',
        proposalHash: 'ph',
      } as any,
      projectedItems: [
        {
          itineraryItemId: 'tmp',
          sourceItemId: 's1',
          dayIndex: 1,
          date: '2027-07-10',
          placeId: 381037,
          label: 'Thingvellir',
          startMin: 600,
          endMin: 720,
          startTime: '10:00',
          endTime: '12:00',
          kind: 'ATTRACTION',
        },
        {
          itineraryItemId: 'tmp2',
          sourceItemId: 's2',
          dayIndex: 2,
          date: '2027-07-11',
          placeId: 381038,
          label: 'Geysir',
          startMin: 600,
          endMin: 700,
          startTime: '10:00',
          endTime: '11:40',
          kind: 'ATTRACTION',
        },
      ],
    });

    expect(result.createdTrip).toBe(true);
    expect(result.prismaTripId).toBe('trip_test_prisma_01');
    expect(result.version.persistence).toBe('prisma');
    expect(result.version.appliedItemCount).toBe(2);
    expect(createdItems).toHaveLength(2);
    expect(createdItems[0].placeId).toBe(381037);
    expect(createdItems[0].type).toBe('ACTIVITY');
  });

  it('rejects when no placeIds exist in catalog', async () => {
    const prisma = {
      place: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(),
    };
    const svc = new IcelandInitialPlanPrismaApplyService(prisma as any);
    await expect(
      svc.materialize({
        shell: shell(),
        ownerId: 'user-1',
        planVersionId: 'pv_1',
        proposal: { proposalId: 'p', proposalHash: 'h' } as any,
        projectedItems: [
          {
            itineraryItemId: 't',
            sourceItemId: 's',
            dayIndex: 1,
            date: '2027-07-10',
            placeId: 999999,
            label: 'Missing',
            startMin: 0,
            endMin: 60,
            startTime: '00:00',
            endTime: '01:00',
            kind: 'ATTRACTION',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
