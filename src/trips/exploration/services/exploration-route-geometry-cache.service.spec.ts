import { ExplorationRouteGeometryCacheService } from './exploration-route-geometry-cache.service';

describe('ExplorationRouteGeometryCacheService', () => {
  let prevTtl: string | undefined;

  beforeEach(() => {
    prevTtl = process.env.EXPLORATION_ROUTE_GEOMETRY_CACHE_TTL_SEC;
    process.env.EXPLORATION_ROUTE_GEOMETRY_CACHE_TTL_SEC = '60';
  });

  afterEach(() => {
    if (prevTtl === undefined) delete process.env.EXPLORATION_ROUTE_GEOMETRY_CACHE_TTL_SEC;
    else process.env.EXPLORATION_ROUTE_GEOMETRY_CACHE_TTL_SEC = prevTtl;
  });

  it('stores and retrieves segment geometry', () => {
    const cache = new ExplorationRouteGeometryCacheService();
    const key = cache.getSegmentKey(-21.94, 64.14, -19.0, 63.42);
    const points: Array<[number, number]> = [[-21.94, 64.14], [-19.0, 63.42]];
    cache.set(key, points);
    expect(cache.get(key)).toEqual(points);
  });
});
