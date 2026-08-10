import { TripListService } from './trip-list.service';

describe('TripListService', () => {
  const prisma = {
    trip: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    countryProfile: {
      findMany: jest.fn(),
    },
  };

  let service: TripListService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear process country cache between tests
    (TripListService as unknown as { countryByCode: null; countryCacheAt: number }).countryByCode =
      null;
    (TripListService as unknown as { countryCacheAt: number }).countryCacheAt = 0;
    service = new TripListService(prisma as never);
  });

  it('paginates in DB and returns thin cards without metadata/days/collaborators', async () => {
    prisma.trip.count.mockResolvedValue(2);
    prisma.trip.findMany.mockResolvedValue([
      {
        id: 'trip-a',
        name: 'A',
        destination: 'IS',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-07T00:00:00.000Z'),
        status: 'PLANNING',
        budgetConfig: { totalBudget: 500000, currency: 'ISK' },
        createdAt: new Date('2026-07-02T00:00:00.000Z'),
        updatedAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    ]);
    prisma.countryProfile.findMany.mockResolvedValue([
      {
        isoCode: 'IS',
        nameCN: '冰岛',
        coverImageUrl: 'https://cdn.example.com/is.jpg',
      },
    ]);

    const result = await service.getTripListPage('user-1', { limit: 1, offset: 0 });

    expect(result.total).toBe(2);
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.id).toBe('trip-a');
    expect(result.trips[0]?.destinationLabel).toBe('冰岛');
    expect(result.trips[0]?.days).toEqual([]);
    expect(result.trips[0]?.totalBudget).toBe(500000);
    expect(result.trips[0]?.currency).toBe('ISK');
    expect(result.trips[0]?.listSummary).toEqual(
      expect.objectContaining({
        coverImageUrl: 'https://cdn.example.com/is.jpg',
        durationDays: 7,
        memberCount: 1,
        displayStatus: 'planning',
      }),
    );
    expect(result.trips[0]?.listSummary).not.toHaveProperty('progressPercent');
    expect(result.trips[0]?.listSummary).not.toHaveProperty('feasibilityScore');

    expect(prisma.trip.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          TripCollaborator: { some: { userId: 'user-1' } },
        }),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 1,
        select: expect.objectContaining({
          id: true,
          name: true,
          destination: true,
          budgetConfig: true,
        }),
      }),
    );
    expect(prisma.trip.findMany.mock.calls[0][0].select).not.toHaveProperty('metadata');
    expect(prisma.trip.findMany.mock.calls[0][0].select).not.toHaveProperty('TripDay');
  });

  it('returns empty page with total only', async () => {
    prisma.trip.count.mockResolvedValue(0);
    prisma.trip.findMany.mockResolvedValue([]);
    prisma.countryProfile.findMany.mockResolvedValue([]);

    const result = await service.getTripListPage(undefined, { limit: 20, offset: 0 });

    expect(result).toEqual({ trips: [], total: 0 });
  });
});
