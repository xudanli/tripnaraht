import {
  buildIcelandPoiOfficialConstraints,
  officialConstraintIdForPoiAccessRule,
  poiAccessRuleOverlapsTripDates,
  resolveIcelandPoiSlugsFromTrip,
} from './iceland-poi-official-constraints.util';

describe('iceland-poi-official-constraints.util', () => {
  const baseTrip = {
    id: 'trip-is-poi',
    destination: 'IS',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-07-10'),
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
    TripDay: [
      {
        date: new Date('2026-07-05'),
        ItineraryItem: [
          {
            type: 'activity',
            note: 'Visit Blue Lagoon',
            Place: { nameEN: 'Blue Lagoon', nameCN: '蓝湖' },
          },
        ],
      },
    ],
  };

  it('resolveIcelandPoiSlugsFromTrip: matches itinerary place names', () => {
    expect(resolveIcelandPoiSlugsFromTrip(baseTrip)).toContain('is.blue_lagoon');
  });

  it('resolveIcelandPoiSlugsFromTrip: matches metadata.mustPlaces without itinerary', () => {
    const slugs = resolveIcelandPoiSlugsFromTrip({
      ...baseTrip,
      TripDay: [],
      metadata: { constraints: { mustPlaces: ['Landmannalaugar 高地'] } },
    });
    expect(slugs).toContain('is.landmannalaugar');
  });

  it('poiAccessRuleOverlapsTripDates: summer trip overlaps landmannalaugar parking window', () => {
    const ok = poiAccessRuleOverlapsTripDates(
      { validFrom: '2026-06-20', validTo: '2026-09-13' } as any,
      { start: new Date('2026-07-01'), end: new Date('2026-07-10') },
    );
    expect(ok).toBe(true);
  });

  it('buildIcelandPoiOfficialConstraints: injects blue lagoon reservation card', () => {
    const cards = buildIcelandPoiOfficialConstraints(baseTrip, 'user-1');
    expect(
      cards.some(
        (c) =>
          c.id ===
          officialConstraintIdForPoiAccessRule('is.blue_lagoon.reservation_required'),
      ),
    ).toBe(true);
  });

  it('buildIcelandPoiOfficialConstraints: skips winter-only trail rule for july trip', () => {
    const cards = buildIcelandPoiOfficialConstraints(
      {
        ...baseTrip,
        TripDay: [
          {
            date: new Date('2026-07-05'),
            ItineraryItem: [{ note: 'Skaftafell hike', Place: { nameEN: 'Skaftafell' } }],
          },
        ],
      },
      'user-1',
    );
    expect(
      cards.some((c) => c.id.includes('skaftafell_trail_s3_spring_closure')),
    ).toBe(false);
  });
});
