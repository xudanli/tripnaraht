import { EngineGeometryRouteProvider } from './engine-geometry-route.provider';
import { PersonalizedRouteProvider } from './personalized-route.provider';
import { StaticArchetypeRouteProvider } from './static-archetype-route.provider';
import type { RouteGenerationContext } from '../types/exploration-route-generation.types';

describe('EngineGeometryRouteProvider', () => {
  const staticProvider = new StaticArchetypeRouteProvider();
  const personalizedProvider = new PersonalizedRouteProvider(staticProvider);

  const ctx: RouteGenerationContext = {
    scenarioId: 'scn-1',
    tripId: 'trip-1',
    destinationCode: 'IS',
    protocolId: null,
    generationVersion: 1,
    initialInput: {
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-07-01', endDate: '2026-07-09' },
      travelers: [{ type: 'ADULT' }, { type: 'ADULT' }],
      mobilityContext: { vehicleType: '4WD_SUV' },
      source: 'USER_CREATED',
    },
    rankedPrinciples: ['CORE_EXPERIENCE'],
  };

  it('falls back to PERSONALIZED when Mapbox is not configured', async () => {
    const provider = new EngineGeometryRouteProvider(personalizedProvider);
    const variants = await provider.generate(ctx);
    expect(variants.length).toBe(3);
    expect(variants.every((v) => v.generationSource === 'PERSONALIZED')).toBe(true);
  });

  it('stitches mainLine via Mapbox and marks ENGINE_MAPBOX', async () => {
    const mapbox = {
      isConfigured: () => true,
      computeRouteGeometry: jest.fn().mockResolvedValue({
        polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        distanceMeters: 1000,
        durationMinutes: 10,
      }),
    };
    const provider = new EngineGeometryRouteProvider(personalizedProvider, mapbox as never);
    const variants = await provider.generate(ctx);
    const withEngine = variants.filter((v) => v.generationSource === 'ENGINE_MAPBOX');
    expect(withEngine.length).toBe(3);
    expect(mapbox.computeRouteGeometry).toHaveBeenCalled();
    for (const v of withEngine) {
      expect(v.routeDetail?.map.mainLine.length).toBeGreaterThan(1);
    }
    const highlands = variants.find((v) => v.routeId === 'route_remote-highlands-south');
    expect(highlands?.routeDetail?.map.fRoadLine?.length).toBeGreaterThan(7);
  });

  it('reuses segment cache across variants in one generate call', async () => {
    const mapbox = {
      isConfigured: () => true,
      computeRouteGeometry: jest.fn().mockResolvedValue({
        polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
        distanceMeters: 1000,
        durationMinutes: 10,
      }),
    };
    const provider = new EngineGeometryRouteProvider(personalizedProvider, mapbox as never);
    await provider.generate(ctx);
    const firstRunCalls = mapbox.computeRouteGeometry.mock.calls.length;
    expect(firstRunCalls).toBeGreaterThan(0);

    mapbox.computeRouteGeometry.mockClear();
    await provider.generate(ctx);
    expect(mapbox.computeRouteGeometry.mock.calls.length).toBe(firstRunCalls);
  });
});
