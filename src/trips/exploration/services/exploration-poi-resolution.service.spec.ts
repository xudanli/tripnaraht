import { ExplorationPoiResolutionService } from './exploration-poi-resolution.service';
import type { GeneratedRouteVariantBundle } from '../types/exploration-route-generation.types';

describe('ExplorationPoiResolutionService', () => {
  const cpre = {
    resolveBatch: jest.fn(),
  };
  const registry = {
    getCatalog: jest.fn().mockReturnValue([]),
  };

  const service = new ExplorationPoiResolutionService(cpre as any, registry as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enrichVariants always writes resolvedPois into routeDetail (including empty)', async () => {
    cpre.resolveBatch.mockResolvedValue({ results: [] });

    const variant: GeneratedRouteVariantBundle = {
      routeId: 'route_test',
      strategyId: 'test',
      variantBranchKey: 'v1',
      title: 'Test',
      narrative: '无 POI 提及',
      metrics: {},
      gains: [],
      sacrifices: [],
      generationSource: 'STATIC_CATALOG',
      routeDetail: {
        summary: 's',
        totalKm: 1,
        avgDrivingHours: 1,
        stayChanges: 1,
        regions: [],
        highlights: [],
        preparations: [],
        days: [],
        map: { mainLine: [[0, 0], [1, 1]] },
      },
    };

    const [out] = await service.enrichVariants([variant], 'IS');
    expect(out.routeDetail?.resolvedPois).toEqual([]);
  });

  it('resolveForRouteDetail always re-resolves from route text', async () => {
    cpre.resolveBatch.mockResolvedValue({
      results: [{ status: 'MATCHED', poiId: 'is.blue_lagoon', confidence: 0.99 }],
    });
    registry.getCatalog.mockReturnValue([
      { poiId: 'is.blue_lagoon', canonicalName: 'Blue Lagoon', aliases: ['蓝湖'], country: 'IS' },
    ]);

    const resolved = await service.resolveForRouteDetail(
      {
        resolvedPois: [{ name: '旧数据', resolved: false, status: 'NOT_FOUND' }],
        highlights: [],
        days: [{ experience: '蓝湖', route: '', theme: '', driving: '', stay: '', mapPoint: { lng: 0, lat: 0 } }],
        map: { mainLine: [[0, 0]] },
      },
      'narrative',
      'IS',
    );

    expect(cpre.resolveBatch).toHaveBeenCalled();
    expect(resolved[0]?.poiId).toBe('is.blue_lagoon');
  });
});
