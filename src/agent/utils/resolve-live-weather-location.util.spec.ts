import {
  formatPlaceForWeatherGeocode,
  resolveLiveWeatherLocationFromAnchoredTrip,
  resolveLiveWeatherLocationFromMessage,
} from './resolve-live-weather-location.util';

describe('resolveLiveWeatherLocationFromMessage', () => {
  it('从话术解析冰岛地名', () => {
    expect(resolveLiveWeatherLocationFromMessage('维克今天风大吗')?.location).toContain('Vík');
  });

  it('无地名时返回 null', () => {
    expect(resolveLiveWeatherLocationFromMessage('今天天气怎么样')).toBeNull();
  });
});

describe('formatPlaceForWeatherGeocode', () => {
  it('冰岛行程 Place 追加国家后缀', () => {
    expect(formatPlaceForWeatherGeocode({ nameEN: 'Vik Supermarket' }, 'IS')).toBe(
      'Vik Supermarket, Iceland',
    );
  });
});

describe('resolveLiveWeatherLocationFromAnchoredTrip', () => {
  const prisma = {
    trip: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('行程进行中：取当日首个 Place 作为查询串', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      destination: 'IS',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-06-07T00:00:00.000Z'),
      TripDay: [
        {
          date: new Date('2026-06-04T00:00:00.000Z'),
          ItineraryItem: [
            {
              placeId: 1,
              Place: { id: 1, nameEN: 'Black Sand Beach Suite Hotel', nameCN: '黑沙海滩套房酒店', metadata: {} },
            },
            {
              placeId: 2,
              Place: { id: 2, nameEN: 'Vik Supermarket', nameCN: 'Vik Supermarket', metadata: {} },
            },
          ],
        },
      ],
    });

    const result = await resolveLiveWeatherLocationFromAnchoredTrip(
      prisma,
      'trip-1',
      new Date('2026-06-04T12:00:00.000Z'),
    );

    expect(result).toEqual({
      location: 'Black Sand Beach Suite Hotel, Iceland',
      countryCode: 'IS',
      anchorLabel: '黑沙海滩套房酒店',
    });
  });

  it('出发前：取首日 Place', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      destination: 'IS',
      startDate: new Date('2026-06-10T00:00:00.000Z'),
      endDate: new Date('2026-06-15T00:00:00.000Z'),
      TripDay: [
        {
          date: new Date('2026-06-10T00:00:00.000Z'),
          ItineraryItem: [
            {
              placeId: 1,
              Place: { id: 1, nameEN: 'Reykjavik', nameCN: '雷克雅未克', metadata: {} },
            },
          ],
        },
      ],
    });

    const result = await resolveLiveWeatherLocationFromAnchoredTrip(
      prisma,
      'trip-2',
      new Date('2026-06-04T12:00:00.000Z'),
    );

    expect(result?.location).toBe('Reykjavik, Iceland');
  });
});
