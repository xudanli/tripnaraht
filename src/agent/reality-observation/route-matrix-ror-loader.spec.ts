/**
 * Route Matrix / Weather Geo ROR loaders 单测。
 */

import {
  estimateDriveMinutesHaversine,
  hasFetchableRouteCoords,
  loadRouteTravelTimeMatrixForRor,
} from './route-matrix-ror-loader';
import { resolveWeatherGeoForRor } from './ror-weather-geo.util';
import { buildWorldServiceRorLoaders } from './world-service-ror-loaders';
import { buildRorSeedFacts } from './observation-seed.builder';
import { createObservationFetchHost } from './observation-seed.builder';
import { runObservationLoop } from './observation-executor';
import { buildObservationPlan } from './observation-plan.builder';

describe('route-matrix-ror-loader', () => {
  it('Google Routes 优先于 itinerary fallback', async () => {
    const routes = {
      getRoutes: jest.fn().mockResolvedValue([{ durationMinutes: 95 }]),
    };
    const matrix = await loadRouteTravelTimeMatrixForRor(
      routes,
      [
        {
          from: { lat: 64.15, lng: -21.94 },
          to: { lat: 63.42, lng: -19.01 },
          fromLabel: 'Reykjavik',
          toLabel: 'Vik',
          fallbackMinutes: 180,
        },
      ],
      { travelMode: 'DRIVING' },
    );
    expect(matrix?.provider).toBe('GOOGLE_ROUTES');
    expect(matrix?.totalMinutes).toBe(95);
    expect(matrix?.legs[0]?.source).toBe('GOOGLE_ROUTES');
    expect(routes.getRoutes).toHaveBeenCalled();
  });

  it('无 Google 时用 itinerary，再无则 Haversine', async () => {
    const withFb = await loadRouteTravelTimeMatrixForRor(undefined, [
      {
        from: { lat: 64.15, lng: -21.94 },
        to: { lat: 63.42, lng: -19.01 },
        fallbackMinutes: 200,
      },
    ]);
    expect(withFb?.provider).toBe('ITINERARY');
    expect(withFb?.totalMinutes).toBe(200);

    const haversine = await loadRouteTravelTimeMatrixForRor(undefined, [
      {
        from: { lat: 64.15, lng: -21.94 },
        to: { lat: 63.42, lng: -19.01 },
      },
    ]);
    expect(haversine?.provider).toBe('HAVERSINE_ESTIMATE');
    expect(haversine!.totalMinutes).toBeGreaterThan(0);
    const est = estimateDriveMinutesHaversine(
      { lat: 64.15, lng: -21.94 },
      { lat: 63.42, lng: -19.01 },
    );
    expect(haversine!.totalMinutes).toBe(est.minutes);
  });

  it('有坐标腿时 seed 不预置 matrix，ROUTE loader 写入事实', async () => {
    const legs = [
      {
        from: { lat: 64.15, lng: -21.94 },
        to: { lat: 63.42, lng: -19.01 },
        fallbackMinutes: 150,
      },
    ];
    expect(hasFetchableRouteCoords(legs)).toBe(true);

    const tripDay = {
      dayIndex: 1,
      date: '2026-08-10',
      activities: [{ durationMinutes: 120, lat: 64.15, lng: -21.94 }],
      travelMode: 'SELF_DRIVE' as const,
      travelMinutesHint: 150,
      routeLegs: legs,
      weatherCityHint: 'Vik',
      latitudeDeg: 63.42,
    };
    const seeds = buildRorSeedFacts({
      scope: { tripId: 't1', dayIndex: 1, message: '第1天会不会太赶' },
      tripDay,
    });
    expect(seeds.byKey['route.travelTimeMatrix']).toBeUndefined();

    const routes = {
      getRoutes: jest.fn().mockResolvedValue([{ durationMinutes: 110 }]),
    };
    const loaders = buildWorldServiceRorLoaders({
      routes,
      routeLegs: legs,
      travelMinutesHint: 150,
      cityHint: 'Vik',
      latitudeDeg: 63.42,
      dateYmd: '2026-08-10',
    });
    const host = createObservationFetchHost({ seeds, loaders: loaders as any });
    const plan = buildObservationPlan({
      message: '第1天会不会太赶',
      scope: { tripId: 't1', dayIndex: 1, message: '第1天会不会太赶' },
      travelMode: 'SELF_DRIVE',
    });
    expect(plan?.operation).toBe('DAY_PACE');
    const state = await runObservationLoop(plan!, seeds, host);
    const matrixFact = state.observedFacts.find((f) => f.key === 'route.travelTimeMatrix');
    expect(matrixFact?.value).toEqual(
      expect.objectContaining({ provider: 'GOOGLE_ROUTES', totalMinutes: 110 }),
    );
  });
});

describe('ror-weather-geo', () => {
  it('从目的地 / 坐标解析天气城市', () => {
    expect(
      resolveWeatherGeoForRor({ destination: '冰岛南岸 Vik' }).city,
    ).toBe('Vik');
    expect(
      resolveWeatherGeoForRor({ destination: 'Akureyri' }).source,
    ).toBe('DESTINATION');
    const near = resolveWeatherGeoForRor({
      latitudeDeg: 63.4,
      longitudeDeg: -19.0,
    });
    expect(near.city).toBe('Vik');
    expect(near.source).toBe('COORD_NEAREST');
  });
});
