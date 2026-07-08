import { ExplorationTripConditionsSyncService } from './exploration-trip-conditions-sync.service';

describe('ExplorationTripConditionsSyncService', () => {
  const tx = {
    trip: { update: jest.fn() },
    tripDay: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    itineraryItem: { count: jest.fn() },
  };

  const prisma = {
    trip: {
      findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };

  const ontologyIngest = {
    ingestExplorationInsuranceDeclaration: jest.fn(async () => ({ factIds: [] })),
    ingestExplorationRentalContract: jest.fn(async () => ({ factIds: [] })),
  };

  const service = new ExplorationTripConditionsSyncService(
    prisma as never,
    ontologyIngest as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('updates trip metadata and appends days when range grows', async () => {
    prisma.trip.findUniqueOrThrow.mockResolvedValue({
      metadata: { tripVersion: 1, constraints: {} },
    });
    tx.tripDay.findMany.mockResolvedValue([
      { id: 'd1', date: new Date('2026-07-01') },
      { id: 'd2', date: new Date('2026-07-02') },
    ]);

    await service.syncTripFromInput('trip-1', {
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-07-01', endDate: '2026-07-05' },
      travelers: [{ type: 'ADULT' }],
      mobilityContext: { vehicleType: '4WD_SUV' },
      source: 'USER_CREATED',
    });

    expect(tx.trip.update).toHaveBeenCalled();
    expect(tx.tripDay.create).toHaveBeenCalled();
    expect(ontologyIngest.ingestExplorationInsuranceDeclaration).toHaveBeenCalled();
    expect(ontologyIngest.ingestExplorationRentalContract).toHaveBeenCalled();
  });
});
