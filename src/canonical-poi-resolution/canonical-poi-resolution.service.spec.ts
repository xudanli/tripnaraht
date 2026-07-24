import { CanonicalPoiResolutionService } from './services/canonical-poi-resolution.service';
import { PoiAliasRegistryService } from './services/poi-alias-registry.service';

describe('CanonicalPoiResolutionService', () => {
  const registry = {
    getCatalog: jest.fn().mockReturnValue([
      {
        poiId: 'is.blue_lagoon',
        canonicalName: 'Blue Lagoon',
        aliases: ['蓝湖', 'Bláa Lónið'],
        country: 'IS',
        status: 'ACTIVE',
      },
      {
        poiId: 'is.reynisfjara',
        canonicalName: 'Reynisfjara',
        aliases: ['黑沙滩', 'Black Sand Beach'],
        country: 'IS',
        status: 'ACTIVE',
      },
    ]),
    getByPoiId: jest.fn((id: string) =>
      id === 'is.blue_lagoon'
        ? {
            poiId: 'is.blue_lagoon',
            canonicalName: 'Blue Lagoon',
            aliases: ['蓝湖'],
            country: 'IS',
            status: 'ACTIVE',
          }
        : undefined,
    ),
  };

  const prisma = {
    poiResolutionLog: { create: jest.fn().mockResolvedValue({}) },
  };

  const service = new CanonicalPoiResolutionService(
    registry as unknown as PoiAliasRegistryService,
    prisma as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves 蓝湖 to is.blue_lagoon via ALIAS', async () => {
    const result = await service.resolve({ name: '蓝湖', countryCode: 'IS' });
    expect(result.status).toBe('MATCHED');
    expect(result.method).toBe('ALIAS');
    expect(result.poiId).toBe('is.blue_lagoon');
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.evidence?.some((e) => e.stage === 'CANONICAL')).toBe(true);
  });

  it('resolves Blue Lagoon to is.blue_lagoon via EXACT', async () => {
    const result = await service.resolve({ name: 'Blue Lagoon', countryCode: 'IS' });
    expect(result.status).toBe('MATCHED');
    expect(result.method).toBe('EXACT');
    expect(result.poiId).toBe('is.blue_lagoon');
  });

  it('returns NOT_FOUND for unknown POI', async () => {
    const result = await service.resolve({ name: 'Secret Canyon', countryCode: 'IS' });
    expect(result.status).toBe('NOT_FOUND');
    expect(result.confidence).toBe(0);
  });

  it('resolveBatch summarizes results', async () => {
    const batch = await service.resolveBatch([
      { name: '蓝湖', countryCode: 'IS' },
      { name: 'Unknown Place XYZ', countryCode: 'IS' },
    ]);
    expect(batch.summary.total).toBe(2);
    expect(batch.summary.matched).toBe(1);
    expect(batch.summary.notFound).toBe(1);
  });

  it('getCanonicalPoi returns catalog entry', () => {
    expect(service.getCanonicalPoi('is.blue_lagoon')?.canonicalName).toBe('Blue Lagoon');
    expect(service.getCanonicalPoi('is.missing')).toBeNull();
  });
});
