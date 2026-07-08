import { PersonalizedRouteProvider } from '../providers/personalized-route.provider';
import { StaticArchetypeRouteProvider } from '../providers/static-archetype-route.provider';
import type { RouteGenerationContext } from '../types/exploration-route-generation.types';

describe('PersonalizedRouteProvider', () => {
  const staticProvider = new StaticArchetypeRouteProvider();
  const provider = new PersonalizedRouteProvider(staticProvider);

  const baseCtx: RouteGenerationContext = {
    scenarioId: 'scn-1',
    tripId: 'trip-1',
    destinationCode: 'IS',
    protocolId: null,
    generationVersion: 1,
    initialInput: {
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-07-01', endDate: '2026-07-09' },
      party: { adults: 2, children: 0 },
      mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
    },
    rankedPrinciples: ['REMOTE_EXPLORATION'],
  };

  it('marks variants as PERSONALIZED with tailored narrative', () => {
    const variants = provider.generate(baseCtx);
    expect(variants.length).toBe(3);
    expect(variants.every((v) => v.generationSource === 'PERSONALIZED')).toBe(true);
    expect(variants[0]?.narrative).toContain('9 天');
    expect(variants[0]?.narrative).toContain('2WD');
  });

  it('adds 2WD highlands sacrifice for remote-highlands strategy', () => {
    const highlands = provider.generate(baseCtx).find((v) => v.strategyId === 'remote-highlands-south');
    expect(highlands?.sacrifices.some((s) => s.id === 'sac_2wd_highlands')).toBe(true);
    expect(highlands?.routeDetail?.preparations[0]).toContain('2WD');
  });

  it('stores routeDetail on each variant', () => {
    const variants = provider.generate(baseCtx);
    expect(variants.every((v) => v.routeDetail?.days.length)).toBe(true);
    expect(variants.every((v) => v.routeDetail?.map.mainLine.length)).toBe(true);
  });
});

describe('decodePolyline', () => {
  it('decodes a known polyline segment', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { decodePolyline } = require('../utils/decode-polyline.util') as typeof import('../utils/decode-polyline.util');
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points.length).toBeGreaterThan(1);
    expect(points[0]?.[0]).toBeCloseTo(-120.2, 0);
  });
});
