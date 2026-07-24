import {
  CpreEntityResolutionBridge,
  inferEntityResolutionCountryCode,
} from './cpre-entity-resolution.bridge';
import { CanonicalPoiResolutionService } from '../services/canonical-poi-resolution.service';

describe('CpreEntityResolutionBridge', () => {
  const cpre = {
    resolve: jest.fn(),
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const bridge = new CpreEntityResolutionBridge(
    cpre as unknown as CanonicalPoiResolutionService,
    prisma as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('inferEntityResolutionCountryCode detects Iceland from query', () => {
    expect(inferEntityResolutionCountryCode({ query: '冰岛南岸 蓝湖' })).toBe('IS');
    expect(inferEntityResolutionCountryCode({ query: '杭州西湖' })).toBeUndefined();
  });

  it('tryResolvePoiQuery maps CPRE match to entity result', async () => {
    cpre.resolve.mockResolvedValue({
      status: 'MATCHED',
      method: 'ALIAS',
      poiId: 'is.blue_lagoon',
      confidence: 0.97,
      matchedPoi: {
        poiId: 'is.blue_lagoon',
        canonicalName: 'Blue Lagoon',
        aliases: [],
        country: 'IS',
        status: 'ACTIVE',
      },
    });

    const attempt = await bridge.tryResolvePoiQuery('蓝湖', 'IS');
    expect(attempt.result?.source).toBe('cpre');
    expect(attempt.result?.metadata?.canonical_poi_id).toBe('is.blue_lagoon');
    expect(attempt.result?.lat).toBeGreaterThan(63);
  });

  it('tryResolvePoiQuery returns clarification for ambiguous', async () => {
    cpre.resolve.mockResolvedValue({
      status: 'AMBIGUOUS',
      confidence: 0.7,
      candidates: [
        { poiId: 'is.a', canonicalName: 'A', confidence: 0.68 },
        { poiId: 'is.b', canonicalName: 'B', confidence: 0.66 },
      ],
    });

    const attempt = await bridge.tryResolvePoiQuery('Secret Canyon', 'IS');
    expect(attempt.result).toBeNull();
    expect(attempt.clarification?.options).toEqual(['A', 'B']);
  });
});
