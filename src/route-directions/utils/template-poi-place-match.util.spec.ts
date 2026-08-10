import {
  findPlaceByTemplatePoiNames,
  type TemplatePoiPlaceRow,
} from './template-poi-place-match.util';

describe('findPlaceByTemplatePoiNames', () => {
  const gullfoss = {
    id: 381084,
    uuid: 'uuid-gullfoss',
    nameCN: '黄金瀑布',
    nameEN: 'Gullfoss',
    category: 'WATERFALL',
  };

  function mockPrisma(sequence: Array<TemplatePoiPlaceRow | null>) {
    let call = 0;
    return {
      place: {
        findFirst: jest.fn(async () => sequence[call++] ?? null),
      },
    };
  }

  it('matches by exact nameEN (e.g. Gullfoss → 381084)', async () => {
    const prisma = mockPrisma([gullfoss]);
    const hit = await findPlaceByTemplatePoiNames(prisma, { nameEN: 'Gullfoss' }, 'IS');
    expect(hit?.id).toBe(381084);
    expect(prisma.place.findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls back to nameCN when nameEN misses', async () => {
    const prisma = mockPrisma([null, gullfoss]);
    const hit = await findPlaceByTemplatePoiNames(
      prisma,
      { nameEN: 'Unknown', nameCN: '黄金瀑布' },
      'IS',
    );
    expect(hit?.id).toBe(381084);
    expect(prisma.place.findFirst).toHaveBeenCalledTimes(2);
  });

  it('returns null when no names provided', async () => {
    const prisma = mockPrisma([]);
    const hit = await findPlaceByTemplatePoiNames(prisma, {}, 'IS');
    expect(hit).toBeNull();
    expect(prisma.place.findFirst).not.toHaveBeenCalled();
  });

  it('tries aliasNames before original name', async () => {
    const prisma = mockPrisma([gullfoss]);
    const hit = await findPlaceByTemplatePoiNames(
      prisma,
      { nameCN: '未知瀑布' },
      'IS',
      { aliasNames: ['Gullfoss'] },
    );
    expect(hit?.id).toBe(381084);
  });

  it('falls back to city hub place when enabled', async () => {
    const hub = {
      id: 99,
      uuid: 'hub',
      nameCN: '西宁',
      nameEN: null,
      category: 'TRANSIT_HUB',
    };
    const prisma = {
      place: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null) // exact poi name
          .mockResolvedValueOnce(null) // fuzzy poi name
          .mockResolvedValueOnce(hub), // city hub: exact city-name place
      },
      city: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, nameCN: '西宁' }),
      },
    };
    const hit = await findPlaceByTemplatePoiNames(
      prisma as any,
      { nameCN: '西宁' },
      'CN',
      { cityFallback: true, excludeCategories: ['HOTEL'] },
    );
    expect(hit?.id).toBe(99);
    expect(prisma.city.findFirst).toHaveBeenCalled();
  });

  it('city hub prefers same-name place over top-rated scenic', async () => {
    const { findCityHubPlace } = await import('./template-poi-place-match.util');
    const cityNamed = {
      id: 17865,
      uuid: 'chengdu-hub',
      nameCN: '成都',
      nameEN: null,
      category: 'TRANSIT_HUB',
    };
    const prisma = {
      place: {
        findFirst: jest.fn().mockResolvedValueOnce(cityNamed),
      },
      city: {
        findFirst: jest.fn().mockResolvedValue({ id: 7755, nameCN: '成都' }),
      },
    };
    const hit = await findCityHubPlace(prisma as any, ['成都'], 'CN', [
      'HOTEL',
      'RESTAURANT',
    ]);
    expect(hit?.id).toBe(17865);
    expect(hit?.nameCN).toBe('成都');
  });
});
