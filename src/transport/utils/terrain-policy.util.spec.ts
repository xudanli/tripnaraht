import {
  resolveTerrainPolicy,
  isIcelandCoords,
  isIcelandHighlandsApprox,
} from './terrain-policy.util';

describe('terrain-policy', () => {
  it('detects Iceland / highlands coords', () => {
    expect(isIcelandCoords(64.1, -19.5)).toBe(true);
    expect(isIcelandCoords(40.7, -74.0)).toBe(false);
    expect(isIcelandHighlandsApprox(64.15, -19.4)).toBe(true);
    expect(isIcelandHighlandsApprox(64.15, -21.9)).toBe(false);
  });

  it('REQUIRED when includeTerrain legacy flag set', () => {
    const d = resolveTerrainPolicy({ includeTerrain: true });
    expect(d.mode).toBe('REQUIRED');
    expect(d.runDem).toBe(true);
    expect(d.demRequired).toBe(true);
  });

  it('AUTO runs DEM for Iceland without client flag', () => {
    const d = resolveTerrainPolicy({
      origin: { lat: 64.0, lng: -19.2 },
      destination: { lat: 64.3, lng: -19.8 },
      distanceM: 95_000,
    });
    expect(d.runDem).toBe(true);
    expect(d.reasons).toEqual(expect.arrayContaining(['ICELAND', 'HIGHLAND']));
    expect(d.demRequired).toBe(true);
  });

  it('AUTO skips short non-Iceland urban hop', () => {
    const d = resolveTerrainPolicy({
      origin: { lat: 40.75, lng: -73.98 },
      destination: { lat: 40.76, lng: -73.97 },
      distanceM: 2_000,
    });
    expect(d.runDem).toBe(false);
    expect(d.reasons).toContain('AUTO_SKIP_LOW_RISK');
  });

  it('SKIP policy never runs DEM', () => {
    const d = resolveTerrainPolicy({
      terrainPolicy: 'SKIP',
      isFRoad: true,
      origin: { lat: 64.0, lng: -19.2 },
      destination: { lat: 64.3, lng: -19.8 },
    });
    expect(d.runDem).toBe(false);
    expect(d.mode).toBe('SKIP');
  });
});
