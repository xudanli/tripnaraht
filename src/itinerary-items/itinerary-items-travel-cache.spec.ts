import { NotFoundException } from '@nestjs/common';
import { ItineraryItemsService } from './itinerary-items.service';

describe('ItineraryItemsService travel cache batch', () => {
  const prisma = {
    trip: { findUnique: jest.fn() },
    tripDay: { findFirst: jest.fn() },
    itineraryItem: { findMany: jest.fn() },
  };

  let service: ItineraryItemsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = Object.create(ItineraryItemsService.prototype);
    (service as any).prisma = prisma;
    jest
      .spyOn(service, 'buildDayTravelInfoFromLoadedItems')
      .mockImplementation((_dayId, _date, _items) => ({
        dayId: _dayId,
        date: new Date('2026-06-20'),
        itemCount: 1,
        segments: [],
        summary: { totalDuration: 10, totalDistance: 1000, segmentCount: 1 },
        source: 'cached' as const,
      }));
  });

  it('getTripTravelInfoFromCache aggregates all days', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      TripDay: [
        { id: 'd1', date: new Date('2026-06-20') },
        { id: 'd2', date: new Date('2026-06-21') },
      ],
    });
    prisma.itineraryItem.findMany.mockResolvedValue([
      { id: 'i1', tripDayId: 'd1', placeId: 1, Place: { nameCN: 'A' } },
      { id: 'i2', tripDayId: 'd2', placeId: 2, Place: { nameCN: 'B' } },
    ]);

    const result = await service.getTripTravelInfoFromCache('trip-1');
    expect(result.tripId).toBe('trip-1');
    expect(result.source).toBe('cached');
    expect(result.days).toHaveLength(2);
    expect(result.summary.totalDays).toBe(2);
    expect(result.summary.totalDuration).toBe(20);
    expect(prisma.itineraryItem.findMany).toHaveBeenCalledTimes(1);
  });

  it('getTripTravelInfoFromCache filters by dates', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      TripDay: [
        { id: 'd1', date: new Date('2026-06-20T00:00:00.000Z') },
        { id: 'd2', date: new Date('2026-06-21T00:00:00.000Z') },
      ],
    });
    prisma.itineraryItem.findMany.mockResolvedValue([
      { id: 'i2', tripDayId: 'd2', placeId: 2, Place: { nameCN: 'B' } },
    ]);

    const result = await service.getTripTravelInfoFromCache('trip-1', {
      dates: ['2026-06-21'],
    });
    expect(result.days).toHaveLength(1);
    expect(service.buildDayTravelInfoFromLoadedItems).toHaveBeenCalledWith(
      'd2',
      expect.any(Date),
      expect.any(Array),
    );
  });

  it('getTripTravelInfoFromCache throws when trip missing', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.getTripTravelInfoFromCache('missing')).rejects.toThrow(NotFoundException);
  });
});
