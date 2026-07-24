import {
  collectOccupiedPoiKeysFromTripDayRows,
  filterCandidatesExcludingOccupiedPois,
} from './itinerary-adjust-cross-day-dedupe.util';

describe('itinerary-adjust-cross-day-dedupe', () => {
  const dayRows = [
    {
      dateIso: '2026-06-01',
      dayNumber: 1,
      items: [{ type: 'POI', placeId: 101, name: '冰河湖', lat: 64, lng: -16 }],
    },
    {
      dateIso: '2026-06-03',
      dayNumber: 3,
      items: [{ type: 'POI', placeId: 202, name: '维克', lat: 63.4, lng: -19 }],
    },
  ];

  it('excludes POIs already scheduled on other trip days', () => {
    const occupied = collectOccupiedPoiKeysFromTripDayRows(dayRows, '2026-06-03');
    const { kept, excludedCount } = filterCandidatesExcludingOccupiedPois(
      [
        { poi_id: '101', name: '冰河湖' },
        { poi_id: '303', name: '斯科加瀑布' },
      ],
      occupied,
    );
    expect(excludedCount).toBe(1);
    expect(kept).toHaveLength(1);
    expect((kept[0] as { name: string }).name).toBe('斯科加瀑布');
  });
});
