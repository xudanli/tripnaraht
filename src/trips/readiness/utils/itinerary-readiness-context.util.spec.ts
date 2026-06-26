import {
  inferPlaceIdsForHazardType,
  type TripPlaceRef,
} from './itinerary-readiness-context.util';

function ref(overrides: Partial<TripPlaceRef> & { placeId: number; name: string }): TripPlaceRef {
  return {
    day: 1,
    category: 'attraction',
    ...overrides,
  };
}

describe('inferPlaceIdsForHazardType — road hazards', () => {
  const places: TripPlaceRef[] = [
    ref({ placeId: 1, day: 1, name: 'Thingvellir', nameCN: '辛格维利尔国家公园', canonicalType: 'NATIONAL_PARK' }),
    ref({ placeId: 2, day: 1, name: 'Geysir', nameCN: '盖歇尔间歇泉', canonicalType: 'GEYSER' }),
    ref({ placeId: 3, day: 2, name: 'Seljalandsfoss', nameCN: '塞里雅兰瀑布', canonicalType: 'WATERFALL' }),
    ref({ placeId: 4, day: 3, name: 'Skaftafell', nameCN: '斯卡夫塔山国家公园', canonicalType: 'NATIONAL_PARK' }),
    ref({ placeId: 5, day: 3, name: 'Jokulsarlon', nameCN: '冰河湖', canonicalType: 'GLACIER_LAGOON' }),
    ref({ placeId: 6, day: 5, name: 'Dill', nameCN: '迪尔餐厅', canonicalType: 'RESTAURANT', category: 'restaurant' }),
    ref({ placeId: 7, day: 6, name: 'Blue Lagoon', nameCN: '蓝湖温泉', canonicalType: 'SPA_POOL' }),
  ];

  it('maps ROAD to remote/mountain POIs only, not the full itinerary', () => {
    const ids = inferPlaceIdsForHazardType('ROAD', places);
    expect(ids).toContain(4);
    expect(ids).toContain(5);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(6);
    expect(ids).not.toContain(7);
    expect(ids.length).toBeLessThan(places.length);
  });

  it('maps road_closure the same way', () => {
    const ids = inferPlaceIdsForHazardType('road_closure', places);
    expect(ids).toEqual(inferPlaceIdsForHazardType('ROAD', places));
  });

  it('returns empty when no POI matches road hazard profile', () => {
    const urbanOnly = [
      ref({ placeId: 10, name: 'Reykjavik', nameCN: '雷克雅未克', canonicalType: 'CITY' }),
      ref({ placeId: 11, name: 'Dill', nameCN: '迪尔餐厅', canonicalType: 'RESTAURANT', category: 'restaurant' }),
    ];
    expect(inferPlaceIdsForHazardType('ROAD', urbanOnly)).toEqual([]);
  });
});

describe('inferPlaceIdsForHazardType — non-road', () => {
  const places: TripPlaceRef[] = [
    ref({ placeId: 1, day: 1, name: 'Thingvellir', nameCN: '辛格维利尔国家公园', canonicalType: 'NATIONAL_PARK' }),
    ref({ placeId: 2, day: 1, name: 'Geysir', nameCN: '盖歇尔间歇泉', canonicalType: 'GEYSER' }),
    ref({ placeId: 3, day: 2, name: 'Seljalandsfoss', nameCN: '塞里雅兰瀑布', canonicalType: 'WATERFALL' }),
    ref({ placeId: 6, day: 5, name: 'Dill', nameCN: '迪尔餐厅', canonicalType: 'RESTAURANT', category: 'restaurant' }),
    ref({ placeId: 7, day: 6, name: 'Blue Lagoon', nameCN: '蓝湖温泉', canonicalType: 'SPA_POOL' }),
  ];

  it('maps VOLCANIC to geothermal/volcano POIs only', () => {
    const ids = inferPlaceIdsForHazardType('VOLCANIC', places);
    expect(ids).toContain(2);
    expect(ids).not.toContain(6);
    expect(ids).not.toContain(7);
  });

  it('maps COLD to outdoor POIs, excluding restaurants and spa', () => {
    const ids = inferPlaceIdsForHazardType('COLD', places);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(6);
    expect(ids).not.toContain(7);
    expect(ids.length).toBeLessThan(places.length);
  });

  it('still falls back for unknown types', () => {
    const places = [ref({ placeId: 1, name: 'A' }), ref({ placeId: 2, name: 'B' })];
    expect(inferPlaceIdsForHazardType('unknown_type', places)).toEqual([1, 2]);
  });
});
