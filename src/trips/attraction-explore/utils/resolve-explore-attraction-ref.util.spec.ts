import { resolvePlaceIdFromAttractionRef } from './resolve-explore-attraction-ref.util';

describe('resolvePlaceIdFromAttractionRef', () => {
  it('resolves uuid via place.findFirst', async () => {
    const prisma = {
      place: {
        findFirst: jest.fn().mockResolvedValue({ id: 42 }),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    } as any;

    await expect(resolvePlaceIdFromAttractionRef(prisma, 'abc-uuid')).resolves.toBe(42);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('resolves is.* slug via metadata then name', async () => {
    let call = 0;
    const prisma = {
      place: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $queryRaw: jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) return []; // metadata miss
        return [
          {
            id: 381039,
            nameCN: '雷尼斯黑沙滩',
            nameEN: 'Reynisfjara Black Sand Beach',
            category: 'ATTRACTION',
            lat: 63.404,
            lng: -19.0454,
            metadata: {},
          },
        ];
      }),
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    } as any;

    await expect(resolvePlaceIdFromAttractionRef(prisma, 'is.reynisfjara')).resolves.toBe(381039);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('returns null for unknown non-canonical string', async () => {
    const prisma = {
      place: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    } as any;

    await expect(resolvePlaceIdFromAttractionRef(prisma, 'not-a-place')).resolves.toBeNull();
  });
});
