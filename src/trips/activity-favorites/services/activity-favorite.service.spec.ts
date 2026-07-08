import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityFavoriteService } from './activity-favorite.service';
import { ActivityFavoriteAccessService } from './activity-favorite-access.service';

describe('ActivityFavoriteService', () => {
  const tripId = 'trip-1';
  const userId = 'user-1';
  const itemId = 'activity-item-1';

  const prisma = {
    tripActivityFavorite: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    itineraryItem: {
      findFirst: jest.fn(),
    },
    place: {
      findUnique: jest.fn(),
    },
  };

  const access = {
    assertTripMember: jest.fn().mockResolvedValue(undefined),
  };

  let service: ActivityFavoriteService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ActivityFavoriteService(
      prisma as never,
      access as unknown as ActivityFavoriteAccessService,
    );
  });

  it('lists favorites for user', async () => {
    prisma.tripActivityFavorite.findMany.mockResolvedValue([
      {
        targetKey: `item:${itemId}`,
        itineraryItemId: itemId,
        placeId: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
      },
    ]);

    const result = await service.listFavorites(tripId, userId);
    expect(result.total).toBe(1);
    expect(result.itineraryItemIds).toEqual([itemId]);
  });

  it('adds favorite for activity item', async () => {
    prisma.itineraryItem.findFirst.mockResolvedValue({ id: itemId, type: 'ACTIVITY' });
    prisma.tripActivityFavorite.upsert.mockResolvedValue({});
    prisma.tripActivityFavorite.findMany.mockResolvedValue([
      {
        targetKey: `item:${itemId}`,
        itineraryItemId: itemId,
        placeId: null,
        createdAt: new Date(),
      },
    ]);

    const result = await service.setFavorite(tripId, userId, {
      itineraryItemId: itemId,
      favorited: true,
    });
    expect(result.favorited).toBe(true);
    expect(result.total).toBe(1);
    expect(prisma.tripActivityFavorite.upsert).toHaveBeenCalled();
  });

  it('removes favorite', async () => {
    prisma.itineraryItem.findFirst.mockResolvedValue({ id: itemId, type: 'ACTIVITY' });
    prisma.tripActivityFavorite.deleteMany.mockResolvedValue({ count: 1 });
    prisma.tripActivityFavorite.findMany.mockResolvedValue([]);

    const result = await service.setFavorite(tripId, userId, {
      itineraryItemId: itemId,
      favorited: false,
    });
    expect(result.favorited).toBe(false);
    expect(result.total).toBe(0);
  });

  it('rejects non-activity itinerary item', async () => {
    prisma.itineraryItem.findFirst.mockResolvedValue({ id: itemId, type: 'REST' });
    await expect(
      service.setFavorite(tripId, userId, { itineraryItemId: itemId, favorited: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing target', async () => {
    await expect(
      service.setFavorite(tripId, userId, { favorited: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown place', async () => {
    prisma.place.findUnique.mockResolvedValue(null);
    await expect(
      service.setFavorite(tripId, userId, { placeId: 999, favorited: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
