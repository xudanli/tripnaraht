import {
  passesHardPoiGuards,
  selectClusteredPois,
  haversineKm,
  isPoiWithinDestinationBounds,
} from './poi-selection-geometry.runner';

describe('poi-selection-geometry.runner', () => {
  it('rejects HIGH risk POIs', () => {
    expect(
      passesHardPoiGuards(
        { name: 'x', address: 'a', metadata: { risk_level: 'HIGH' } },
        'IS',
      ),
    ).toBe(false);
  });

  it('allows Iceland planning fallback anchors', () => {
    expect(
      passesHardPoiGuards(
        { name: 'x', source: 'poi_planning_fallback' },
        'IS',
      ),
    ).toBe(true);
  });

  it('checks Iceland bounds', () => {
    expect(
      isPoiWithinDestinationBounds(
        { coordinates: { lat: 64.1, lng: -21.9 } },
        '冰岛',
      ),
    ).toBe(true);
    expect(
      isPoiWithinDestinationBounds(
        { coordinates: { lat: 35.6, lng: 139.7 } },
        '冰岛',
      ),
    ).toBe(false);
  });

  it('clusters nearby POIs', () => {
    const selected = selectClusteredPois(
      [
        { name: 'a', coordinates: { lat: 64.1, lng: -21.9 } },
        { name: 'b', coordinates: { lat: 64.15, lng: -21.85 } },
        { name: 'far', coordinates: { lat: 66.0, lng: -18.0 } },
      ],
      3,
      { lat: 64.1, lng: -21.9 },
      '冰岛',
    );
    expect(selected.map((p) => p.name)).toContain('a');
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
  });
});
