import { PlanningLodgingWorkbenchService } from './planning-lodging-workbench.service';

describe('PlanningLodgingWorkbenchService', () => {
  const prisma = {
    tripDay: { findMany: jest.fn() },
    itineraryItem: { findMany: jest.fn() },
    trip: { findUniqueOrThrow: jest.fn() },
    place: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  const service = new PlanningLodgingWorkbenchService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tripDay.findMany.mockResolvedValue([
      { id: 'day-1', date: new Date('2026-08-01') },
      { id: 'day-2', date: new Date('2026-08-02') },
    ]);
    prisma.trip.findUniqueOrThrow.mockResolvedValue({ destination: 'IS' });
    prisma.itineraryItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        tripDayId: 'day-1',
        placeId: 381375,
        note: null,
        type: 'ACTIVITY',
        Place: { nameCN: '凯瑞斯火山口', nameEN: 'Kerid', category: 'ATTRACTION', rating: 4.5 },
        TripDay: { date: new Date('2026-08-01') },
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { id: 381375, lat: 64.0413, lng: -20.8851 },
      { id: 381046, lat: 64.0, lng: -20.9 },
    ]);
    prisma.place.findMany.mockResolvedValue([
      {
        id: 381046,
        nameCN: '黑沙滩套房酒店',
        nameEN: 'Black Beach Suites',
        rating: 9.2,
        metadata: { region: 'Vik' },
      },
    ]);
  });

  it('builds lodging suggestions and legs for nights without booked lodging', async () => {
    const view = await service.buildView({ tripId: 'trip-1' });

    expect(view.suggestions.length).toBeGreaterThan(0);
    expect(view.suggestions[0]).toMatchObject({
      nightIndex: 1,
      dayIndex: 1,
      kind: 'recommended',
      placeId: 381046,
    });
    expect(view.lodgingPois.length).toBeGreaterThan(0);
    expect(view.lodgingLegs[0]).toMatchObject({
      nightIndex: 1,
      from: { kind: 'day_anchor', placeId: 381375 },
      to: { kind: 'suggested_lodging', placeId: 381046 },
    });
  });
});
