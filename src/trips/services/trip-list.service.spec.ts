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
    tripCollaborator: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  let service: TripListService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TripListService(prisma as never);
  });

  it('paginates with lightweight index query and returns card summary without feasibility fields', async () => {
    prisma.trip.count.mockResolvedValue(2);
    prisma.trip.findMany
      .mockResolvedValueOnce([
        { id: 'trip-b', status: 'PLANNING', createdAt: new Date('2026-07-01T00:00:00.000Z') },
        { id: 'trip-a', status: 'PLANNING', createdAt: new Date('2026-07-02T00:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        {
          id: 'trip-a',
          name: 'A',
          destination: 'IS',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-07T00:00:00.000Z'),
          status: 'PLANNING',
          budgetConfig: null,
          metadata: { progressPercent: 35 },
          createdAt: new Date('2026-07-02T00:00:00.000Z'),
          updatedAt: new Date('2026-07-02T00:00:00.000Z'),
          TripDay: [{ id: 'day-a', date: new Date('2026-08-01T00:00:00.000Z'), _count: { ItineraryItem: 2 } }],
          _count: { TripCollaborator: 1 },
        },
      ]);

    prisma.countryProfile.findMany.mockResolvedValue([
      {
        isoCode: 'IS',
        nameCN: '冰岛',
        currencyCode: 'ISK',
        coverImageUrl: 'https://cdn.example.com/is.jpg',
      },
    ]);
    prisma.tripCollaborator.findMany.mockResolvedValue([
      { tripId: 'trip-a', userId: 'user-1' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', displayName: 'Alice', avatarUrl: null },
    ]);

    const result = await service.getTripListPage('user-1', { limit: 1, offset: 0 });

    expect(result.total).toBe(2);
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.id).toBe('trip-a');
    expect(result.trips[0]?.listSummary?.progressPercent).toBe(35);
    expect(result.trips[0]?.listSummary?.coverImageUrl).toBe('https://cdn.example.com/is.jpg');
    expect(result.trips[0]?.listSummary).not.toHaveProperty('feasibilityScore');
    expect(result.trips[0]?.listSummary).not.toHaveProperty('hardConflictCount');
    expect(result.trips[0]?.listSummary).not.toHaveProperty('pendingConfirmCount');

    expect(prisma.trip.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          TripCollaborator: { some: { userId: 'user-1' } },
        }),
        select: { id: true, status: true, createdAt: true },
      }),
    );
    expect(prisma.trip.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['trip-a'] } },
      }),
    );
  });
});
