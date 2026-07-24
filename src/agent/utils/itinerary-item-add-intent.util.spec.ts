import {
  extractDaySearchAnchor,
  intentAlreadySatisfiedOnDay,
  isIntentBasedPoiQuery,
  resolvePlaceIdForIntentAdd,
  resolvePoiIntentProfile,
} from './itinerary-item-add-intent.util';

describe('itinerary-item-add-intent.util', () => {
  it('detects intent-based poi queries', () => {
    expect(isIntentBasedPoiQuery('一个可以购买水果的')).toBe(true);
    expect(isIntentBasedPoiQuery('斯卡夫塔山国家公园')).toBe(false);
    expect(isIntentBasedPoiQuery('Bonus 超市')).toBe(true);
  });

  it('maps fruit shopping intent to supermarket profile', () => {
    const profile = resolvePoiIntentProfile('一个可以购买水果的');
    expect(profile?.intentLabel).toBe('超市/购物点');
    expect(profile?.geoCategories).toContain('SHOPPING');
  });

  it('extracts anchor from day attractions preferring scenic POIs', () => {
    const trip = {
      TripDay: [
        {
          id: 'd1',
          ItineraryItem: [
            {
              id: 'h1',
              Place: {
                id: 1,
                nameCN: '酒店',
                category: 'HOTEL',
                location: { lat: 63.4, lng: -19.0 },
              },
            },
            {
              id: 'a1',
              Place: {
                id: 2,
                nameCN: '黄金瀑布',
                category: 'ATTRACTION',
                location: { lat: 64.327, lng: -20.121 },
              },
            },
          ],
        },
      ],
    };
    expect(extractDaySearchAnchor(trip, 1)).toEqual({ lat: 64.327, lng: -20.121 });
  });

  it('resolves nearest supermarket candidate not already on day', () => {
    const trip = {
      TripDay: [
        {
          id: 'd1',
          ItineraryItem: [{ id: 'a1', Place: { id: 2, nameCN: '黄金瀑布', category: 'ATTRACTION' } }],
        },
      ],
    };
    const profile = resolvePoiIntentProfile('购买水果')!;
    const placeId = resolvePlaceIdForIntentAdd(
      trip,
      1,
      [
        { id: 100, nameCN: 'Krónan Selfoss', category: 'SHOPPING', distanceMeters: 8000 },
        { id: 101, nameCN: 'Bonus Vik', category: 'SHOPPING', distanceMeters: 3000 },
      ],
      profile,
    );
    expect(placeId).toBe(101);
  });

  it('detects when shopping intent already satisfied on day', () => {
    const trip = {
      TripDay: [
        {
          id: 'd1',
          ItineraryItem: [{ id: 's1', Place: { id: 50, nameCN: 'Bonus', category: 'SHOPPING' } }],
        },
      ],
    };
    const profile = resolvePoiIntentProfile('购买水果')!;
    expect(intentAlreadySatisfiedOnDay(trip, 1, profile)).toBe(true);
  });
});
