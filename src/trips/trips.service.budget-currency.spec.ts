import { BadRequestException } from '@nestjs/common';
import { DecisionEventBus, DecisionEventEmitter } from './decision/optimization/events/decision-events';
import { TripStatus } from './dto/trip-status.dto';
import { TripLifecycleValidatorService } from './services/trip-lifecycle-validator.service';
import { TripsService } from './trips.service';

describe('TripsService budgetConfig.currency merge', () => {
  let service: TripsService;
  let prisma: {
    trip: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let lastUpdateData: Record<string, unknown> | undefined;

  const baseTrip = {
    id: 'trip-currency-1',
    name: 'Iceland',
    destination: 'IS',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-10T00:00:00.000Z'),
    status: TripStatus.PLANNING,
    budgetConfig: { totalBudget: 500000 },
    metadata: {},
    pacingConfig: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    lastUpdateData = undefined;
    prisma = {
      trip: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const eventBus = new DecisionEventBus();
    const eventEmitter = new DecisionEventEmitter(eventBus);

    service = new TripsService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      new TripLifecycleValidatorService(eventEmitter),
      eventEmitter,
    );

    jest.spyOn(service as any, 'enrichTripData').mockImplementation(async (trip: any) => trip);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockUpdate(existingTrip: typeof baseTrip, updatedTrip: Record<string, unknown>) {
    prisma.trip.findUnique.mockResolvedValue(existingTrip);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        trip: {
          update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            lastUpdateData = data;
            return updatedTrip;
          }),
          findUnique: jest.fn().mockResolvedValue(updatedTrip),
        },
        tripDay: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        itineraryItem: {
          update: jest.fn(),
        },
      }),
    );
  }

  it('writes currency into budgetConfig while preserving totalBudget', async () => {
    const updatedTrip = {
      ...baseTrip,
      budgetConfig: { totalBudget: 500000, currency: 'ISK' },
    };
    mockUpdate(baseTrip, updatedTrip);

    const result = await service.update(baseTrip.id, { currency: 'ISK' }, 'user-1');

    expect(lastUpdateData?.budgetConfig).toEqual({
      totalBudget: 500000,
      currency: 'ISK',
    });
    expect(result.budgetConfig).toEqual({ totalBudget: 500000, currency: 'ISK' });
  });

  it('merges totalBudget and currency in one write', async () => {
    const updatedTrip = {
      ...baseTrip,
      budgetConfig: { totalBudget: 500000, currency: 'ISK' },
    };
    mockUpdate(baseTrip, updatedTrip);

    await service.update(
      baseTrip.id,
      { totalBudget: 500000, currency: 'isk' },
      'user-1',
    );

    expect(lastUpdateData?.budgetConfig).toEqual({
      totalBudget: 500000,
      currency: 'ISK',
    });
  });

  it('rejects unsupported currency codes', async () => {
    mockUpdate(baseTrip, baseTrip);

    await expect(
      service.update(baseTrip.id, { currency: 'XXX' as any }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
