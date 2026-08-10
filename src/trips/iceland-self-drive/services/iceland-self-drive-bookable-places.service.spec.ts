import { PlaceCategory } from '@prisma/client';
import { IcelandSelfDriveBookablePlacesService } from './iceland-self-drive-bookable-places.service';

jest.mock(
  '../../attraction-explore/utils/attraction-explore-place-coordinates.util',
  () => ({
    loadPlaceCoordinatesBatch: jest.fn().mockResolvedValue(
      new Map([[101, { lat: 63.42, lng: -19.01 }]]),
    ),
  }),
);

describe('IcelandSelfDriveBookablePlacesService', () => {
  it('searches lodging places scoped to Iceland', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 101,
        nameCN: '维克黑沙滩酒店',
        nameEN: 'Vik Black Beach Hotel',
        address: 'Vík í Mýrdal',
        rating: 4.6,
        metadata: { countryCode: 'IS', regionKey: 'IS_SOUTH_COAST' },
        City: { name: 'Vík', nameEN: 'Vík' },
      },
    ]);
    const prisma = { place: { findMany } };
    const svc = new IcelandSelfDriveBookablePlacesService(prisma as never);
    const res = await svc.search({
      kind: 'lodging',
      q: '维克',
      regionIds: ['south_coast'],
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: PlaceCategory.HOTEL }),
      ]),
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      placeId: 101,
      kind: 'lodging',
      nameZh: '维克黑沙滩酒店',
      regionId: 'south_coast',
      lat: 63.42,
      lng: -19.01,
      imageUrl: null,
      anchorEligible: false,
      bookingProvider: 'booking_com',
      bookingCtaLabelZh: '在 Booking.com 查看',
    });
    expect(res.items[0]?.bookingUrl).toContain('booking.com/searchresults.html');
    expect(res.items[0]?.bookingUrl).toContain(
      encodeURIComponent('Vik Black Beach Hotel, Iceland'),
    );
    expect(res.items[0]?.bookingLinks.map((l) => l.provider)).toEqual([
      'booking_com',
      'airbnb',
      'trip_com',
    ]);
    expect(res.items[0]?.bookingLinks.find((l) => l.provider === 'airbnb')?.url).toContain(
      'airbnb.com',
    );
    expect(res.items[0]?.bookingLinks.find((l) => l.provider === 'trip_com')?.url).toContain(
      'trip.com',
    );
  });

  it('marks Golden Set lodging placeIds as anchorEligible', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 381045,
        nameCN: '维克旅舍',
        nameEN: 'Vík Hostel',
        address: 'Vík',
        rating: 4.5,
        metadata: { countryCode: 'IS', regionKey: 'IS_SOUTH_COAST' },
        City: null,
      },
    ]);
    const prisma = { place: { findMany } };
    const svc = new IcelandSelfDriveBookablePlacesService(prisma as never);
    const res = await svc.search({ kind: 'lodging' });
    expect(res.items[0]?.anchorEligible).toBe(true);
  });

  it('prefers official website as bookingUrl when present in metadata', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 303,
        nameCN: '官网酒店',
        nameEN: 'Official Hotel',
        address: null,
        rating: 4.0,
        metadata: {
          countryCode: 'IS',
          website: 'https://www.official-hotel.is/',
        },
        City: null,
      },
    ]);
    const prisma = { place: { findMany } };
    const svc = new IcelandSelfDriveBookablePlacesService(prisma as never);
    const res = await svc.search({ kind: 'lodging' });
    expect(res.items[0]).toMatchObject({
      bookingUrl: 'https://www.official-hotel.is/',
      bookingProvider: 'official',
      bookingCtaLabelZh: '去官网预订',
    });
    expect(res.items[0]?.bookingLinks.map((l) => l.provider)).toEqual([
      'official',
      'booking_com',
      'airbnb',
      'trip_com',
    ]);
  });

  it('projects imageUrl from Place.metadata', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 202,
        nameCN: '带图酒店',
        nameEN: 'Hotel With Image',
        address: null,
        rating: 4.2,
        metadata: {
          countryCode: 'IS',
          imageUrl: 'https://cdn.example.com/hotel.jpg',
        },
        City: null,
      },
    ]);
    const prisma = { place: { findMany } };
    const svc = new IcelandSelfDriveBookablePlacesService(prisma as never);
    const res = await svc.search({ kind: 'lodging' });
    expect(res.items[0]?.imageUrl).toBe('https://cdn.example.com/hotel.jpg');
  });

  it('searches activity with ATTRACTION/SUPPLY categories', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { place: { findMany } };
    const svc = new IcelandSelfDriveBookablePlacesService(prisma as never);
    await svc.search({ kind: 'activity' });
    const where = findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: { in: [PlaceCategory.ATTRACTION, PlaceCategory.SUPPLY] },
        }),
      ]),
    );
  });
});
