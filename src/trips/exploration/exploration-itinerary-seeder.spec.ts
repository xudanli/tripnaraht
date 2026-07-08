import { ItemType } from '@prisma/client';
import { ExplorationItinerarySeederService } from './services/exploration-itinerary-seeder.service';

describe('ExplorationItinerarySeederService', () => {
  it('seeds F208 transit item and road bindings for remote-highlands strategy', async () => {
    const tripDayId = 'day_3';
    const tx = {
      itineraryItem: {
        deleteMany: jest.fn(),
        create: jest.fn(async () => ({})),
      },
      trip: {
        update: jest.fn(async () => ({})),
      },
    };

    const prisma = {
      trip: {
        findUniqueOrThrow: jest.fn(async () => ({
          id: 'trip_1',
          metadata: {},
          TripDay: [{ id: tripDayId, date: new Date('2026-09-12') }],
        })),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    };

    const service = new ExplorationItinerarySeederService(
      prisma as any,
      {
        ingestExplorationRouteSelection: jest.fn(async () => ({ factIds: ['f1'] })),
      } as any,
    );
    const result = await service.seedForSelectedRoute({
      tripId: 'trip_1',
      strategyId: 'remote-highlands-south',
      routeId: 'route_remote-highlands-south',
      initialInput: {
        destinationCodes: ['IS'],
        dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
        travelers: [{ type: 'ADULT' }],
        mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
        source: 'RESEARCH_PROTOCOL',
      },
    });

    expect(result.itemCount).toBe(1);
    expect(tx.itineraryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tripDayId,
          type: ItemType.TRANSIT,
          note: expect.stringContaining('F208'),
        }),
      }),
    );
    expect(tx.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            constraints: { vehicle_type: '2WD' },
            rfc001IcelandRoadBindings: expect.any(Object),
          }),
        }),
      }),
    );
  });
});
