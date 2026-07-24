import {
  hydrateActiveRouteHealthSnapshot,
  hydrateRouteHealthByKey,
  resolveRouteHealthFromContext,
} from './route-health-memory.util';

describe('route-health-memory.util (hydrate)', () => {
  it('hydrateActiveRouteHealthSnapshot coerces string numbers from JSON', () => {
    const snap = hydrateActiveRouteHealthSnapshot({
      routeDirectionId: '123',
      countryCode: 'is',
      totalRuns: '10',
      successRuns: '4',
      failureRuns: '6',
      successRate: '0.4',
      healthScore: '0.25',
      commonFailureReasons: ['fatigue_overload'],
      commonRepairs: null,
      loadedAt: '2026-06-09T00:00:00.000Z',
    });

    expect(snap).toMatchObject({
      routeDirectionId: 123,
      countryCode: 'IS',
      totalRuns: 10,
      successRuns: 4,
      failureRuns: 6,
      successRate: 0.4,
      healthScore: 0.25,
      commonFailureReasons: ['fatigue_overload'],
      commonRepairs: [],
    });
  });

  it('hydrateRouteHealthByKey normalizes index keys', () => {
    const map = hydrateRouteHealthByKey({
      wrong_key: {
        routeDirectionId: 7,
        countryCode: 'NO',
        totalRuns: 2,
        successRuns: 1,
        failureRuns: 1,
        successRate: 0.5,
        healthScore: 0.3,
        commonFailureReasons: [],
        commonRepairs: [],
        loadedAt: '2026-06-09T00:00:00.000Z',
      },
    });

    expect(map['7_NO']).toBeDefined();
    expect(map['7_NO'].countryCode).toBe('NO');
  });

  it('resolveRouteHealthFromContext works on hydrated plain object', () => {
    const map = hydrateRouteHealthByKey({
      '123_IS': {
        routeDirectionId: 123,
        countryCode: 'IS',
        totalRuns: 5,
        successRuns: 2,
        failureRuns: 3,
        successRate: 0.4,
        healthScore: 0.2,
        commonFailureReasons: [],
        commonRepairs: [],
        loadedAt: '2026-06-09T00:00:00.000Z',
      },
    });

    const resolved = resolveRouteHealthFromContext({ routeHealthByKey: map }, 123, 'IS');
    expect(resolved?.healthScore).toBe(0.2);
  });
});
