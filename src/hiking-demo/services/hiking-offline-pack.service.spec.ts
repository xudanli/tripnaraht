import * as fs from 'fs';
import * as path from 'path';
import {
  HIKING_OFFLINE_PACK_VERSION,
  HikingOfflinePackService,
} from './hiking-offline-pack.service';

describe('HikingOfflinePackService', () => {
  const prisma = {
    routeDirection: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;

  const trailDetail = {
    isHikingRoute: jest.fn().mockReturnValue(true),
    build: jest.fn().mockResolvedValue({
      geometry: {
        polyline: [
          { lat: 63.99, lng: -19.06 },
          { lat: 63.68, lng: -19.48 },
        ],
      },
      supplyPois: [
        {
          id: 'hut-1',
          nameCN: '测试山屋',
          nameEN: 'Hut',
          subCategory: 'HUT',
          lat: 63.99,
          lng: -19.06,
        },
      ],
    }),
  } as any;

  const service = new HikingOfflinePackService(prisma, trailDetail);

  it('packKeyFromName converts IS_LAUGAVEGUR', () => {
    expect(service.packKeyFromName('IS_LAUGAVEGUR')).toBe('is-laugavegur');
  });

  it('getOfflinePack returns URLs with geojson and manifest', async () => {
    prisma.routeDirection.findUnique.mockResolvedValue({
      id: 42,
      name: 'IS_LAUGAVEGUR',
      nameCN: '朗格迈维卢尔',
      tags: ['徒步'],
      metadata: {},
    });

    const pack = await service.getOfflinePack(42);
    expect(pack.geojsonUrl).toContain('/hiking/offline-packs/is-laugavegur/route.geojson');
    expect(pack.tileManifestUrl).toContain('tile-manifest.json');
    expect(pack.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.bounds.north).toBeGreaterThan(pack.bounds.south);
    expect(pack.vectorTileManifestUrl).toContain('vector-tile-manifest.json');

    const manifestPath = path.join(
      process.cwd(),
      'data',
      'hiking',
      'offline-packs',
      'is-laugavegur',
      HIKING_OFFLINE_PACK_VERSION,
      'vector-tile-manifest.json',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.provider).toBe('mapbox-vector');
    expect(manifest.vectorTiles).toEqual([]);
    expect(manifest.vectorTileTemplateUrl).toContain('{access_token}');
    expect(manifest.accessTokenPlaceholder).toBe('{access_token}');
  });
});
