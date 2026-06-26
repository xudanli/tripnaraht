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
});
