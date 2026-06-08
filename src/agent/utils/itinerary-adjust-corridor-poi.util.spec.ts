import {
  distanceToSegmentKm,
  filterPoisWithinCorridorBuffer,
  selectClusteredPoisAlongCorridor,
} from './itinerary-adjust-corridor-poi.util';
import type { ItineraryAdjustSpatialConstraints } from './itinerary-adjust-neighbor-anchors.util';

describe('itinerary-adjust-corridor-poi', () => {
  const constraints: ItineraryAdjustSpatialConstraints = {
    startAnchor: { lat: 63.4195, lng: -19.008 },
    endAnchor: { lat: 64.8395, lng: -23.2703 },
    maxDetourDistanceKm: 50,
    maxRouteDetourRatio: 1.32,
    mode: 'DAY_REPLAN_INTERPOLATION',
  };

  const geysir = {
    name: '盖歇尔间歇泉',
    coordinates: { lat: 64.3103, lng: -20.3011 },
  };
  const skoga = {
    name: '斯科加瀑布',
    coordinates: { lat: 63.5321, lng: -19.5112 },
  };
  const vik = {
    name: '维克',
    coordinates: { lat: 63.4195, lng: -19.008 },
  };

  it('filters golden circle POI far off Vik→Snæfellsnes corridor', () => {
    const filtered = filterPoisWithinCorridorBuffer([geysir, skoga, vik], constraints);
    const names = filtered.map((p) => (p as typeof geysir).name);
    expect(names).toContain('维克');
    expect(names).toContain('斯科加瀑布');
    expect(names).not.toContain('盖歇尔间歇泉');
  });

  it('selectClusteredPoisAlongCorridor returns ordered picks along corridor', () => {
    const selected = selectClusteredPoisAlongCorridor(
      [geysir, skoga, vik, { name: '黑沙滩', coordinates: { lat: 63.4045, lng: -19.0456 } }],
      2,
      constraints,
    );
    expect(selected.length).toBe(2);
    expect(selected[0]).toEqual(vik);
  });

  it('drops POIs without coordinates when requireCoordinates is set', () => {
    const noCoords = { name: '盖歇尔间歇泉' };
    const filtered = filterPoisWithinCorridorBuffer(
      [noCoords, vik],
      constraints,
      undefined,
      { requireCoordinates: true },
    );
    expect(filtered).toHaveLength(1);
    expect((filtered[0] as typeof vik).name).toBe('维克');
  });

  it('distanceToSegmentKm is zero on segment endpoints', () => {
    expect(
      distanceToSegmentKm(constraints.startAnchor, constraints.startAnchor, constraints.endAnchor),
    ).toBeLessThan(1);
  });
});
