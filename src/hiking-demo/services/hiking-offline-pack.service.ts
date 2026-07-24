import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { HikingTrailDetailService } from './hiking-trail-detail.service';
import { getHighlandPoisByIds } from '../utils/highland-poi-catalog.util';
import {
  LAUGAVEGUR_POLYLINE_POI_IDS,
  LAUGAVEGUR_ROUTE_POINTS,
  LAUGAVEGUR_SUPPLY_POI_IDS,
  ROUTE_DIRECTION_NAME,
} from '../constants/laugavegur-demo.constants';

/**  bump when pack layout or tile policy changes */
export const HIKING_OFFLINE_PACK_VERSION = '2026.05.20';

export type VectorTileEntry = {
  z: number;
  x: number;
  y: number;
  url: string;
  checksum?: string;
};

export type HikingVectorTileManifest = {
  version: string;
  bounds: { south: number; west: number; north: number; east: number };
  provider: 'mapbox-vector';
  styleUrl: string;
  packKey: string;
  minZoom: number;
  maxZoom: number;
  attribution: string;
  /** 预打包 CDN：逐瓦片 URL（前端优先） */
  vectorTiles: VectorTileEntry[];
  /** @deprecated 与 vectorTiles 同步，兼容旧客户端 */
  tiles: VectorTileEntry[];
  /** 无 vectorTiles 时：Mapbox API 模板，前端将 {access_token} 替换为 VITE_MAPBOX_ACCESS_TOKEN */
  vectorTileTemplateUrl?: string;
  accessTokenPlaceholder?: string;
  /** 同源 CDN 批量根路径 + 相对模板 */
  tilesBaseUrl?: string;
  tileIndexTemplate?: string;
  noteZh?: string;
  generatedAt: string;
};

export type HikingOfflinePackDto = {
  routeDirectionId: number;
  routeDirectionName: string;
  version: string;
  geojsonUrl: string;
  tileManifestUrl: string;
  /** F4：Mapbox Vector Tiles 清单（预打包 CDN 或 templateUrl） */
  vectorTileManifestUrl?: string;
  sizeBytes: number;
  checksum: string;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  generatedAt: string;
  noteZh?: string;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  metadata: Record<string, unknown>;
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>;
};

@Injectable()
export class HikingOfflinePackService {
  private readonly logger = new Logger(HikingOfflinePackService.name);
  private readonly packRoot = path.join(process.cwd(), 'data', 'hiking', 'offline-packs');

  constructor(
    private readonly prisma: PrismaService,
    private readonly trailDetail: HikingTrailDetailService,
  ) {}

  resolvePublicBaseUrl(): string {
    const raw =
      process.env.HIKING_OFFLINE_PACK_BASE_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL ||
      'http://localhost:3000/api';
    return raw.replace(/\/$/, '');
  }

  packKeyFromName(name: string): string {
    return name.toLowerCase().replace(/_/g, '-');
  }

  async getOfflinePack(routeDirectionId: number): Promise<HikingOfflinePackDto> {
    const rd = await this.prisma.routeDirection.findUnique({
      where: { id: routeDirectionId },
    });
    if (!rd) {
      throw new NotFoundException(`Route direction ${routeDirectionId} not found`);
    }
    if (!this.trailDetail.isHikingRoute(rd)) {
      throw new BadRequestException('Route direction is not a hiking trail');
    }

    const packKey = this.packKeyFromName(rd.name);
    const geojson = await this.buildGeoJson(rd);
    const { dir, geoPath, manifestPath } = this.ensurePackDir(packKey);

    fs.writeFileSync(geoPath, JSON.stringify(geojson, null, 0), 'utf-8');
    const manifest = this.buildTileManifest(geojson, rd.name, packKey);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    const vectorManifest = this.buildVectorTileManifest(manifest.bounds, packKey, dir);
    const vectorPath = path.join(dir, 'vector-tile-manifest.json');
    fs.writeFileSync(vectorPath, JSON.stringify(vectorManifest, null, 2), 'utf-8');

    const geoStat = fs.statSync(geoPath);
    const manifestStat = fs.statSync(manifestPath);
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(geoPath)).digest('hex');
    const base = this.resolvePublicBaseUrl();

    this.logger.log(`Offline pack ready: ${packKey} v${HIKING_OFFLINE_PACK_VERSION}`);

    return {
      routeDirectionId: rd.id,
      routeDirectionName: rd.name,
      version: HIKING_OFFLINE_PACK_VERSION,
      geojsonUrl: `${base}/hiking/offline-packs/${packKey}/route.geojson`,
      tileManifestUrl: `${base}/hiking/offline-packs/${packKey}/tile-manifest.json`,
      vectorTileManifestUrl: `${base}/hiking/offline-packs/${packKey}/vector-tile-manifest.json`,
      sizeBytes: geoStat.size + manifestStat.size + fs.statSync(vectorPath).size,
      checksum,
      bounds: manifest.bounds,
      generatedAt: new Date().toISOString(),
      noteZh:
        'GeoJSON 含路线折线与补给 POI；tile-manifest 为 OSM 栅格模板；vector-tile-manifest 含 vectorTiles（CDN）或 vectorTileTemplateUrl（前端注入 Mapbox token）。',
    };
  }

  /** F4：Mapbox 矢量 manifest — vectorTiles（CDN）或 vectorTileTemplateUrl（在线拉取 + 前端 token） */
  private buildVectorTileManifest(
    bounds: { south: number; west: number; north: number; east: number },
    packKey: string,
    packDir: string,
  ): HikingVectorTileManifest {
    const base = this.resolvePublicBaseUrl();
    const vectorTiles = this.loadVectorTilesIndex(packDir, packKey, base);
    const tilesBaseUrl = `${base}/hiking/offline-packs/${packKey}/tiles`;
    const hasCdnTiles = vectorTiles.length > 0;

    const vectorTileTemplateUrl = hasCdnTiles
      ? undefined
      : (process.env.MAPBOX_VECTOR_TILE_TEMPLATE_URL ??
        this.defaultMapboxVectorTileTemplateUrl());

    const manifest: HikingVectorTileManifest = {
      version: HIKING_OFFLINE_PACK_VERSION,
      bounds,
      provider: 'mapbox-vector',
      styleUrl: process.env.MAPBOX_STYLE_URL ?? 'mapbox://styles/mapbox/outdoors-v12',
      packKey,
      minZoom: Number(process.env.HIKING_VECTOR_TILE_MIN_ZOOM ?? 10),
      maxZoom: Number(process.env.HIKING_VECTOR_TILE_MAX_ZOOM ?? 14),
      attribution: '© Mapbox © OpenStreetMap',
      vectorTiles,
      tiles: vectorTiles,
      vectorTileTemplateUrl,
      accessTokenPlaceholder: vectorTileTemplateUrl?.includes('{access_token}')
        ? '{access_token}'
        : undefined,
      tilesBaseUrl: hasCdnTiles ? tilesBaseUrl : undefined,
      tileIndexTemplate: hasCdnTiles ? '{z}/{x}/{y}.pbf' : undefined,
      noteZh: hasCdnTiles
        ? `已配置 ${vectorTiles.length} 个预打包矢量瓦片（vectorTiles）。`
        : vectorTileTemplateUrl
          ? 'vectorTiles 为空：准备页可用 vectorTileTemplateUrl 拉取 Mapbox .pbf（前端注入 access_token）。生产请预打包并写入 vector-tiles-index.json。'
          : 'vectorTiles 为空；可配置 MAPBOX_VECTOR_TILE_TEMPLATE_URL 或预打包索引。',
      generatedAt: new Date().toISOString(),
    };

    return manifest;
  }

  private defaultMapboxVectorTileTemplateUrl(): string {
    const source =
      process.env.MAPBOX_VECTOR_TILE_SOURCE ?? 'mapbox.mapbox-streets-v8';
    return `https://api.mapbox.com/v4/${source}/{z}/{x}/{y}.vector.pbf?access_token={access_token}`;
  }

  /** 运维侧车：data/hiking/offline-packs/{packKey}/{version}/vector-tiles-index.json */
  private loadVectorTilesIndex(
    packDir: string,
    packKey: string,
    publicBase: string,
  ): VectorTileEntry[] {
    const indexPath = path.join(packDir, 'vector-tiles-index.json');
    if (!fs.existsSync(indexPath)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
        vectorTiles?: VectorTileEntry[];
        tiles?: VectorTileEntry[];
      };
      const list = raw.vectorTiles ?? raw.tiles ?? [];
      return list.map((t) => ({
        z: t.z,
        x: t.x,
        y: t.y,
        url:
          t.url ??
          `${publicBase}/hiking/offline-packs/${packKey}/tiles/${t.z}/${t.x}/${t.y}.pbf`,
        ...(t.checksum ? { checksum: t.checksum } : {}),
      }));
    } catch (e) {
      this.logger.warn(`Invalid vector-tiles-index.json for ${packKey}: ${e}`);
      return [];
    }
  }

  /** packKey 如 is-laugavegur → IS_LAUGAVEGUR */
  async ensurePackFilesForKey(packKey: string): Promise<void> {
    const safeKey = packKey.replace(/[^a-z0-9-]/gi, '');
    const name = safeKey.toUpperCase().replace(/-/g, '_');
    const rd = await this.prisma.routeDirection.findFirst({
      where: { name, isActive: true },
    });
    if (!rd) {
      throw new NotFoundException(`No route direction for pack key ${packKey}`);
    }
    await this.getOfflinePack(rd.id);
  }

  async resolveVectorTileFile(
    packKey: string,
    z: string,
    x: string,
    y: string,
  ): Promise<string> {
    const safeKey = packKey.replace(/[^a-z0-9-]/gi, '');
    const filePath = path.join(
      this.packRoot,
      safeKey,
      HIKING_OFFLINE_PACK_VERSION,
      'tiles',
      z,
      x,
      `${y}.pbf`,
    );
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        `Vector tile not found: ${packKey}/${z}/${x}/${y}.pbf`,
      );
    }
    return filePath;
  }

  async resolvePackFile(
    packKey: string,
    filename: 'route.geojson' | 'tile-manifest.json' | 'vector-tile-manifest.json',
  ): Promise<string> {
    const safeKey = packKey.replace(/[^a-z0-9-]/gi, '');
    const filePath = path.join(
      this.packRoot,
      safeKey,
      HIKING_OFFLINE_PACK_VERSION,
      filename,
    );
    if (!fs.existsSync(filePath)) {
      await this.ensurePackFilesForKey(safeKey);
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Offline pack file not found for ${packKey}`);
    }
    return filePath;
  }

  private ensurePackDir(packKey: string) {
    const dir = path.join(this.packRoot, packKey, HIKING_OFFLINE_PACK_VERSION);
    fs.mkdirSync(dir, { recursive: true });
    return {
      dir,
      geoPath: path.join(dir, 'route.geojson'),
      manifestPath: path.join(dir, 'tile-manifest.json'),
    };
  }

  private async buildGeoJson(rd: {
    id: number;
    name: string;
    nameCN?: string | null;
    metadata?: unknown;
  }): Promise<GeoJsonFeatureCollection> {
    const detail = await this.trailDetail.build(rd, { longestHike: 2, useCachedProfileFallback: true });
    const meta = (rd.metadata ?? {}) as Record<string, unknown>;
    const polylineIds = meta.demoPolylinePoiIds as string[] | undefined;

    let coordinates: Array<[number, number]> = [];
    let supplyPois = detail?.supplyPois ?? [];

    if (detail?.geometry?.polyline?.length) {
      coordinates = detail.geometry.polyline.map((p) => [p.lng, p.lat]);
      supplyPois = detail.supplyPois;
    } else if (rd.name === ROUTE_DIRECTION_NAME) {
      coordinates = LAUGAVEGUR_ROUTE_POINTS.map((p) => [p.lng, p.lat]);
      supplyPois = getHighlandPoisByIds([...LAUGAVEGUR_SUPPLY_POI_IDS, ...LAUGAVEGUR_POLYLINE_POI_IDS]).map(
        (p) => ({
          id: p.id,
          nameCN: p.nameCN,
          nameEN: p.nameEN,
          subCategory: p.subCategory,
          lat: p.lat,
          lng: p.lng,
        }),
      );
    } else if (polylineIds?.length) {
      const pois = getHighlandPoisByIds(polylineIds);
      coordinates = pois.map((p) => [p.lng, p.lat]);
    }

    if (coordinates.length < 2) {
      throw new BadRequestException(
        'Cannot build offline pack: route has fewer than 2 polyline points',
      );
    }

    const features: GeoJsonFeatureCollection['features'] = [
      {
        type: 'Feature',
        properties: {
          role: 'route',
          name: rd.name,
          nameCN: rd.nameCN,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      },
    ];

    for (const poi of supplyPois) {
      features.push({
        type: 'Feature',
        properties: {
          role: 'poi',
          id: poi.id,
          nameCN: poi.nameCN,
          nameEN: poi.nameEN,
          subCategory: poi.subCategory,
        },
        geometry: {
          type: 'Point',
          coordinates: [poi.lng, poi.lat],
        },
      });
    }

    return {
      type: 'FeatureCollection',
      metadata: {
        routeDirectionId: rd.id,
        routeDirectionName: rd.name,
        version: HIKING_OFFLINE_PACK_VERSION,
        pointCount: coordinates.length,
        poiCount: supplyPois.length,
      },
      features,
    };
  }

  private buildTileManifest(
    geojson: GeoJsonFeatureCollection,
    routeDirectionName: string,
    packKey: string,
  ) {
    const bounds = this.computeBounds(geojson);
    const pad = 0.08;
    const south = bounds.south - pad;
    const north = bounds.north + pad;
    const west = bounds.west - pad;
    const east = bounds.east + pad;

    return {
      version: HIKING_OFFLINE_PACK_VERSION,
      routeDirectionName,
      packKey,
      bounds: { south, west, north, east },
      tiles: {
        provider: 'openstreetmap',
        templateUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        minZoom: 9,
        maxZoom: 15,
        attribution: '© OpenStreetMap contributors',
      },
      /** 可选：冰岛高地示意 DEM 无托管瓦片，仅提供边界供客户端自选源 */
      recommendedCacheZoom: [10, 11, 12, 13, 14],
      generatedAt: new Date().toISOString(),
    };
  }

  private computeBounds(geojson: GeoJsonFeatureCollection) {
    let south = 90;
    let north = -90;
    let west = 180;
    let east = -180;

    const ingest = (lng: number, lat: number) => {
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lng);
      east = Math.max(east, lng);
    };

    for (const f of geojson.features) {
      const g = f.geometry;
      if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
        for (const c of g.coordinates as [number, number][]) {
          ingest(c[0], c[1]);
        }
      }
      if (g.type === 'Point' && Array.isArray(g.coordinates)) {
        const c = g.coordinates as [number, number];
        ingest(c[0], c[1]);
      }
    }

    return { south, west, north, east };
  }
}
