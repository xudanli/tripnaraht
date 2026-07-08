import { PoiAliasLearningService } from './services/poi-alias-learning.service';
import { PoiAliasRegistryService } from './services/poi-alias-registry.service';

describe('PoiAliasLearningService', () => {
  const registry = {
    getByPoiId: jest.fn((id: string) =>
      id === 'is.blue_lagoon'
        ? {
            poiId: 'is.blue_lagoon',
            canonicalName: 'Blue Lagoon',
            aliases: [],
            country: 'IS',
            status: 'ACTIVE',
          }
        : undefined,
    ),
    refreshFromDb: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    poiAlias: { upsert: jest.fn().mockResolvedValue({}) },
    poiResolutionLog: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const service = new PoiAliasLearningService(prisma as never, registry as unknown as PoiAliasRegistryService);

  beforeEach(() => jest.clearAllMocks());

  it('confirmSelection returns HUMAN MATCHED and upserts alias', async () => {
    const result = await service.confirmSelection({
      queryName: '天空温泉',
      selectedPoiId: 'is.blue_lagoon',
      userId: 'u1',
      locale: 'zh',
    });

    expect(result.status).toBe('MATCHED');
    expect(result.method).toBe('HUMAN');
    expect(result.poiId).toBe('is.blue_lagoon');
    expect(prisma.poiAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ source: 'USER_CONFIRMED', alias: '天空温泉' }),
      }),
    );
    expect(registry.refreshFromDb).toHaveBeenCalled();
  });

  it('rejects unknown poiId', async () => {
    await expect(
      service.confirmSelection({ queryName: 'x', selectedPoiId: 'is.unknown' }),
    ).rejects.toThrow(/未知 canonical poiId/);
  });
});
