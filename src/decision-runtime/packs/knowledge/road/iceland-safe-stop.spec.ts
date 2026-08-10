import { loadIcelandSafeStopCatalog } from './iceland-safe-stop.loader';
import {
  findIcelandSafeStopsNearby,
  ICELAND_REST_AREA_SAFE_STOP_KINDS,
} from './find-iceland-safe-stops-nearby.util';
import {
  resolveIcelandSafeStop,
  resolveIcelandSafeStopById,
} from './resolve-iceland-safe-stop';

describe('iceland safe-stop catalog', () => {
  it('loads curated stops', () => {
    const catalog = loadIcelandSafeStopCatalog();
    expect(catalog.schemaId).toBe('tripnara.iceland.safe_stop_catalog@v1');
    expect(catalog.stops.length).toBeGreaterThanOrEqual(8);
    expect(catalog.stops.map((s) => s.poiId)).toEqual(
      expect.arrayContaining(['olis_selfoss_ring', 'is.skogafoss', 'is.landmannalaugar']),
    );
  });

  it('finds rest-oriented stops near Skógafoss within 10km', () => {
    const hits = findIcelandSafeStopsNearby({
      lat: 63.5321,
      lng: -19.5113,
      radiusMeters: 10000,
      kinds: ICELAND_REST_AREA_SAFE_STOP_KINDS,
    });
    expect(hits.some((h) => h.poiId === 'is.skogafoss')).toBe(true);
    expect(hits[0].distanceMeters).toBeLessThanOrEqual(500);
  });

  it('resolves F208 by road id to south / highland approach stop', () => {
    const hit = resolveIcelandSafeStop({ roadId: 'F208' });
    expect(hit).toBeDefined();
    expect(hit!.matchReason).toBe('ROAD_ID');
    expect(hit!.stop.roadIds).toContain('F208');
  });

  it('resolves nearest stop near Selfoss', () => {
    const hit = resolveIcelandSafeStop({ lat: 63.93, lng: -21.0 });
    expect(hit?.stop.poiId).toBe('olis_selfoss_ring');
    expect(hit!.distanceKm!).toBeLessThan(5);
  });

  it('returns undefined when no signal', () => {
    expect(resolveIcelandSafeStop({})).toBeUndefined();
  });

  it('validates explicit catalog id', () => {
    expect(resolveIcelandSafeStopById('is.skogafoss')?.matchReason).toBe('EXPLICIT_ID');
    expect(resolveIcelandSafeStopById('not_a_real_stop')).toBeUndefined();
  });
});
