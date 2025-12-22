// src/trips/readiness/services/geo-facts-poi.service.ts

/**
 * Geo Facts POI Service - POI 地理特征服务
 * 
 * 提供基于 OSM POI 数据的核心特征计算：
 * 1. 出海集合点识别和评分
 * 2. 徒步入口识别
 * 3. 安全保障点检查
 * 4. 补给点检查
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';
import { POIPickupScorerService, PickupPoint } from './poi-pickup-scorer.service';
import { POITrailheadService, TrailAccessPoint } from './poi-trailhead.service';
import { DEMElevationService } from './dem-elevation.service';

export interface POIFeatures {
  /** Top 集合点（出海/交通） */
  topPickupPoints: PickupPoint[];
  /** 是否有港口/码头 */
  hasHarbour: boolean;
  /** 徒步入口点 */
  trailAccessPoints: TrailAccessPoint[];
  /** 安全保障点 */
  safety: {
    hasHospital: boolean;
    hasClinic: boolean;
    hasPharmacy: boolean;
    hasPolice: boolean;
    hasFireStation: boolean;
  };
  /** 补给点 */
  supply: {
    hasFuel: boolean;
    hasSupermarket: boolean;
    hasConvenience: boolean;
    hasCarRepair: boolean; // 西藏专用：汽车维修
    hasEVCharger: boolean; // 充电桩
  };
  /** 信息点 */
  information: {
    hasInformationPoint: boolean;
    hasViewpoint: boolean;
  };
  /** 西藏专用特征 */
  xizang?: {
    /** 氧气点数量 */
    oxygenStationCount: number;
    /** 检查站数量 */
    checkpointCount: number;
    /** 山口/垭口数量 */
    mountainPassCount: number;
    /** 平均海拔（米） */
    avgAltitudeM: number | null;
    /** 燃料密度（每 100km 的加油站数量） */
    fuelDensity: number | null;
  };
}

export interface Point {
  lat: number;
  lng: number;
}

export interface Route {
  /** 路线点序列 */
  points: Point[];
}

@Injectable()
export class GeoFactsPOIService {
  private readonly logger = new Logger(GeoFactsPOIService.name);

  private readonly pickupScorer: POIPickupScorerService;
  private readonly trailheadService: POITrailheadService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly demElevationService?: DEMElevationService
  ) {
    // 初始化子服务
    this.pickupScorer = new POIPickupScorerService(prisma);
    this.trailheadService = new POITrailheadService(prisma);
  }

  /**
   * 获取点位的 POI 特征
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param radiusKm 搜索半径（公里），默认 25km
   * @param pickupLimit 返回集合点数量，默认 3
   */
  async getPOIFeaturesForPoint(
    lat: number,
    lng: number,
    radiusKm: number = 25,
    pickupLimit: number = 3
  ): Promise<POIFeatures> {
    try {
      // 并行查询所有特征
      const [
        pickupPoints,
        trailAccessPoints,
        safety,
        supply,
        information,
        xizangFeatures,
      ] = await Promise.all([
        this.pickupScorer.findTopPickupPoints(lat, lng, radiusKm, pickupLimit),
        this.trailheadService.findTrailAccessPoints(lat, lng, radiusKm),
        this.checkSafetyPoints(lat, lng, radiusKm),
        this.checkSupplyPoints(lat, lng, radiusKm),
        this.checkInformationPoints(lat, lng, radiusKm),
        this.checkXizangFeatures(lat, lng, radiusKm),
      ]);

      return {
        topPickupPoints: pickupPoints,
        hasHarbour: pickupPoints.length > 0,
        trailAccessPoints,
        safety,
        supply,
        information,
        xizang: xizangFeatures,
      };
    } catch (error) {
      this.logger.error(`获取点位 POI 特征失败 (${lat}, ${lng}):`, error);
      // 返回默认值
      return {
        topPickupPoints: [],
        hasHarbour: false,
        trailAccessPoints: [],
        safety: {
          hasHospital: false,
          hasClinic: false,
          hasPharmacy: false,
          hasPolice: false,
          hasFireStation: false,
        },
        supply: {
          hasFuel: false,
          hasSupermarket: false,
          hasConvenience: false,
          hasCarRepair: false,
          hasEVCharger: false,
        },
        information: {
          hasInformationPoint: false,
          hasViewpoint: false,
        },
        xizang: {
          oxygenStationCount: 0,
          checkpointCount: 0,
          mountainPassCount: 0,
          avgAltitudeM: null,
          fuelDensity: null,
        },
      };
    }
  }

  /**
   * 获取路线的 POI 特征
   * 
   * @param route 路线（点序列）
   * @param radiusKm 搜索半径（公里），默认 25km
   * @param pickupLimit 返回集合点数量，默认 3
   */
  async getPOIFeaturesForRoute(
    route: Route,
    radiusKm: number = 25,
    pickupLimit: number = 3
  ): Promise<POIFeatures> {
    try {
      // 计算路线中心点
      const centerLat = route.points.reduce((sum, p) => sum + p.lat, 0) / route.points.length;
      const centerLng = route.points.reduce((sum, p) => sum + p.lng, 0) / route.points.length;
      
      // 使用中心点查询 POI 特征
      return await this.getPOIFeaturesForPoint(
        centerLat,
        centerLng,
        radiusKm,
        pickupLimit
      );
    } catch (error) {
      this.logger.error(`获取路线 POI 特征失败:`, error);
      return {
        topPickupPoints: [],
        hasHarbour: false,
        trailAccessPoints: [],
        safety: {
          hasHospital: false,
          hasClinic: false,
          hasPharmacy: false,
          hasPolice: false,
          hasFireStation: false,
        },
        supply: {
          hasFuel: false,
          hasSupermarket: false,
          hasConvenience: false,
          hasCarRepair: false,
          hasEVCharger: false,
        },
        information: {
          hasInformationPoint: false,
          hasViewpoint: false,
        },
        xizang: {
          oxygenStationCount: 0,
          checkpointCount: 0,
          mountainPassCount: 0,
          avgAltitudeM: null,
          fuelDensity: null,
        },
      };
    }
  }

  /**
   * 检查安全保障点
   */
  private async checkSafetyPoints(
    lat: number,
    lng: number,
    radiusKm: number
  ): Promise<{
    hasHospital: boolean;
    hasClinic: boolean;
    hasPharmacy: boolean;
    hasPolice: boolean;
    hasFireStation: boolean;
  }> {
    try {
      const radiusM = radiusKm * 1000;
      
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT DISTINCT category
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category IN ('HOSPITAL', 'PHARMACY', 'SAFETY')
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `);

      const categories = new Set(result.map((r: { category: string }) => r.category));
      
      // 检查具体类型
      const hospitalResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'HOSPITAL'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      const clinicResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND tags_slim->>'amenity' = 'clinic'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      const policeResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND tags_slim->>'amenity' = 'police'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      const fireResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND tags_slim->>'amenity' = 'fire_station'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      return {
        hasHospital: Number(hospitalResult[0]?.count || 0) > 0,
        hasClinic: Number(clinicResult[0]?.count || 0) > 0,
        hasPharmacy: categories.has('PHARMACY'),
        hasPolice: Number(policeResult[0]?.count || 0) > 0,
        hasFireStation: Number(fireResult[0]?.count || 0) > 0,
      };
    } catch (error) {
      this.logger.warn(`检查安全保障点失败:`, error);
      return {
        hasHospital: false,
        hasClinic: false,
        hasPharmacy: false,
        hasPolice: false,
        hasFireStation: false,
      };
    }
  }

  /**
   * 检查补给点
   */
  private async checkSupplyPoints(
    lat: number,
    lng: number,
    radiusKm: number
  ): Promise<{
    hasFuel: boolean;
    hasSupermarket: boolean;
    hasConvenience: boolean;
    hasCarRepair: boolean;
    hasEVCharger: boolean;
  }> {
    try {
      const radiusM = radiusKm * 1000;
      
      const fuelResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'FUEL'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      const supermarketResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'SUPPLY'
          AND tags_slim->>'shop' = 'supermarket'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      const convenienceResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'SUPPLY'
          AND tags_slim->>'shop' = 'convenience'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      // 检查汽车维修
      const carRepairResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'CAR_REPAIR'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      // 检查充电桩
      const evChargerResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'EV_CHARGER'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      return {
        hasFuel: Number(fuelResult[0]?.count || 0) > 0,
        hasSupermarket: Number(supermarketResult[0]?.count || 0) > 0,
        hasConvenience: Number(convenienceResult[0]?.count || 0) > 0,
        hasCarRepair: Number(carRepairResult[0]?.count || 0) > 0,
        hasEVCharger: Number(evChargerResult[0]?.count || 0) > 0,
      };
    } catch (error) {
      this.logger.warn(`检查补给点失败:`, error);
      return {
        hasFuel: false,
        hasSupermarket: false,
        hasConvenience: false,
        hasCarRepair: false,
        hasEVCharger: false,
      };
    }
  }

  /**
   * 检查信息点
   */
  private async checkInformationPoints(
    lat: number,
    lng: number,
    radiusKm: number
  ): Promise<{
    hasInformationPoint: boolean;
    hasViewpoint: boolean;
  }> {
    try {
      const radiusM = radiusKm * 1000;
      
      const infoResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'INFORMATION'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      const viewpointResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'VIEWPOINT'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      return {
        hasInformationPoint: Number(infoResult[0]?.count || 0) > 0,
        hasViewpoint: Number(viewpointResult[0]?.count || 0) > 0,
      };
    } catch (error) {
      this.logger.warn(`检查信息点失败:`, error);
      return {
        hasInformationPoint: false,
        hasViewpoint: false,
      };
    }
  }

  /**
   * 检查西藏特有特征（氧气点、检查站、山口、海拔、燃料密度）
   */
  private async checkXizangFeatures(
    lat: number,
    lng: number,
    radiusKm: number
  ): Promise<{
    oxygenStationCount: number;
    checkpointCount: number;
    mountainPassCount: number;
    avgAltitudeM: number | null;
    fuelDensity: number | null;
  }> {
    try {
      const radiusM = radiusKm * 1000;
      
      // 检查氧气点
      const oxygenResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'OXYGEN_STATION'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      // 检查检查站
      const checkpointResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'CHECKPOINT'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      // 检查山口/垭口
      const mountainPassResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'MOUNTAIN_PASS'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      // 计算平均海拔（从有 altitude_hint 的 POI）
      const altitudeResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT AVG(altitude_hint) as avg_altitude
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND altitude_hint IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ avg_altitude: number | null }>;

      let avgAltitudeM: number | null = altitudeResult[0]?.avg_altitude 
        ? Math.round(altitudeResult[0].avg_altitude) 
        : null;

      // 如果从 POI 查询不到海拔，尝试使用 DEM 数据（后备方案）
      if (avgAltitudeM === null && this.demElevationService) {
        try {
          const demElevation = await this.demElevationService.getElevation(lat, lng);
          if (demElevation !== null) {
            avgAltitudeM = demElevation;
            this.logger.debug(`使用 DEM 数据获取海拔: ${lat}, ${lng} -> ${avgAltitudeM}m`);
          }
        } catch (error) {
          // DEM 查询失败，忽略（可能表不存在）
          this.logger.debug(`DEM 查询失败，使用 POI 海拔: ${error instanceof Error ? error.message : error}`);
        }
      }

      // 计算燃料密度（每 100km 的加油站数量）
      // 先计算半径内的加油站数量
      const fuelCountResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'FUEL'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      const fuelCount = Number(fuelCountResult[0]?.count || 0);
      // 燃料密度 = 加油站数量 / (搜索半径 km / 100)
      const fuelDensity = radiusKm > 0 ? fuelCount / (radiusKm / 100) : null;

      return {
        oxygenStationCount: Number(oxygenResult[0]?.count || 0),
        checkpointCount: Number(checkpointResult[0]?.count || 0),
        mountainPassCount: Number(mountainPassResult[0]?.count || 0),
        avgAltitudeM,
        fuelDensity: fuelDensity !== null ? Math.round(fuelDensity * 100) / 100 : null, // 保留 2 位小数
      };
    } catch (error) {
      this.logger.warn(`检查西藏特征失败:`, error);
      return {
        oxygenStationCount: 0,
        checkpointCount: 0,
        mountainPassCount: 0,
        avgAltitudeM: null,
        fuelDensity: null,
      };
    }
  }
}

