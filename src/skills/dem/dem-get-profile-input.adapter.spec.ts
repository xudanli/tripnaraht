import { normalizeDemGetProfileInput, parseLatLngFromUnknown, inferDemElevationDataQuality } from './dem-get-profile-input.adapter';

describe('inferDemElevationDataQuality', () => {
  it('returns unknown when effort service not used', () => {
    expect(
      inferDemElevationDataQuality({
        usedEffortService: false,
        elevationProfile: [],
        totalDistanceM: 1000,
        totalAscentM: 0,
        maxSlopePct: 0,
      }),
    ).toBe('unknown');
  });

  it('returns low when long distance but all zero elevations', () => {
    expect(
      inferDemElevationDataQuality({
        usedEffortService: true,
        elevationProfile: [{ elevation: 0 }, { elevation: 0 }, { elevation: 0 }],
        totalDistanceM: 5000,
        totalAscentM: 0,
        maxSlopePct: 0,
      }),
    ).toBe('low');
  });

  it('returns high for normal profile', () => {
    expect(
      inferDemElevationDataQuality({
        usedEffortService: true,
        elevationProfile: [{ elevation: 100 }, { elevation: 250 }, { elevation: 200 }],
        totalDistanceM: 3000,
        totalAscentM: 150,
        maxSlopePct: 8,
      }),
    ).toBe('high');
  });
});

describe('dem-get-profile-input.adapter', () => {
  it('parseLatLngFromUnknown parses object and comma string', () => {
    expect(parseLatLngFromUnknown({ lat: 64.1, lng: -21.9 })).toEqual({ lat: 64.1, lng: -21.9 });
    expect(parseLatLngFromUnknown('64.2, -21.8')).toEqual({ lat: 64.2, lng: -21.8 });
    expect(parseLatLngFromUnknown('Reykjavik')).toBeNull();
  });

  it('normalizeDemGetProfileInput keeps polyline with 2+ points', () => {
    const r = normalizeDemGetProfileInput({
      polyline: [
        { lat: 64, lng: -22 },
        { lat: 64.5, lng: -21 },
      ],
      samples: 50,
    });
    expect(r.polyline).toHaveLength(2);
    expect(r.samples).toBe(50);
  });

  it('duplicates single polyline point', () => {
    const r = normalizeDemGetProfileInput({ polyline: [{ lat: 64, lng: -22 }] });
    expect(r.polyline).toEqual([
      { lat: 64, lng: -22 },
      { lat: 64, lng: -22 },
    ]);
  });

  it('builds segment from origin and destination coords', () => {
    const r = normalizeDemGetProfileInput({
      origin: { lat: 64.1, lng: -21.9 },
      destination: { lat: 64.2, lng: -21.8 },
    });
    expect(r.polyline[0]).toEqual({ lat: 64.1, lng: -21.9 });
    expect(r.polyline[1]).toEqual({ lat: 64.2, lng: -21.8 });
  });

  it('destination-only coord becomes degenerate line for elevation sample', () => {
    const r = normalizeDemGetProfileInput({ destination: { lat: 64, lng: -22 } });
    expect(r.polyline).toEqual([
      { lat: 64, lng: -22 },
      { lat: 64, lng: -22 },
    ]);
  });

  it('throws when no usable geometry', () => {
    expect(() => normalizeDemGetProfileInput({ destination: 'Iceland' })).toThrow(/dem.get_profile/);
  });
});
