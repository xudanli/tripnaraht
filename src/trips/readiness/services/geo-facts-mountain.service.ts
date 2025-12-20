// src/trips/readiness/services/geo-facts-mountain.service.ts

/**
 * Geo Facts Mountain Service - 山脉地理特征服务
 * 
 * 提供基于全球山脉数据的核心特征计算：
 * 1. inMountain - 点位是否在山脉区域内
 * 2. mountainElevation - 点位所在山脉的平均/最高海拔
 * 3. mountainDensityScore - 山脉密度评分（区域内山脉覆盖比例）
 * 4. terrainComplexity - 地形复杂度（基于山脉分布）
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

export interface MountainFeatures {
  /** 是否在山脉区域内 */
  inMountain: boolean;
  /** 所在山脉的平均海拔（米） */
  mountainElevationAvg: number | null;
  /** 所在山脉的最高海拔（米） */
  mountainElevationMax: number | null;
  /** 所在山脉的最低海拔（米） */
  mountainElevationMin: number | null;
  /** 山脉密度评分（0-1，基于 buffer 内山脉覆盖比例） */
  mountainDensityScore: number;
  /** 地形复杂度评分（0-1，基于山脉分布和海拔变化） */
  terrainComplexity: number;
  /** 到最近山脉边界的距离（米，如果在山脉内则为0） */
  nearestMountainDistanceM: number | null;
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
export class GeoFactsMountainService {
  private readonly logger = new Logger(GeoFactsMountainService.name);

  constructor(private readonly prisma: PrismaService | PrismaClient) {}

  /**
   * 获取点位的山脉特征
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param densityBufferKm 山脉密度计算的缓冲区半径（公里），默认 5km
   */
  async getMountainFeaturesForPoint(
    lat: number,
    lng: number,
    densityBufferKm: number = 5
  ): Promise<MountainFeatures> {
    try {
      // 1. 检查是否在山脉区域内
      const inMountainResult = await this.checkInMountain(lat, lng);
      
      // 2. 获取山脉海拔信息
      const elevationInfo = inMountainResult.inMountain
        ? await this.getMountainElevation(lat, lng)
        : { avg: null, max: null, min: null };
      
      // 3. 计算山脉密度
      const densityScore = await this.getMountainDensityScore(
        lat,
        lng,
        densityBufferKm
      );
      
      // 4. 计算地形复杂度
      const complexity = await this.getTerrainComplexity(
        lat,
        lng,
        densityBufferKm
      );
      
      // 5. 获取到最近山脉的距离
      const nearestDistance = inMountainResult.inMountain
        ? 0
        : await this.getNearestMountainDistance(lat, lng);
      
      return {
        inMountain: inMountainResult.inMountain,
        mountainElevationAvg: elevationInfo.avg,
        mountainElevationMax: elevationInfo.max,
        mountainElevationMin: elevationInfo.min,
        mountainDensityScore: densityScore,
        terrainComplexity: complexity,
        nearestMountainDistanceM: nearestDistance,
      };
    } catch (error) {
      this.logger.error(`获取点位山脉特征失败 (${lat}, ${lng}):`, error);
      // 返回默认值
      return {
        inMountain: false,
        mountainElevationAvg: null,
        mountainElevationMax: null,
        mountainElevationMin: null,
        mountainDensityScore: 0,
        terrainComplexity: 0,
        nearestMountainDistanceM: null,
      };
    }
  }

  /**
   * 获取路线的山脉特征
   * 
   * @param route 路线（点序列）
   * @param densityBufferKm 山脉密度计算的缓冲区半径（公里），默认 5km
   */
  async getMountainFeaturesForRoute(
    route: Route,
    densityBufferKm: number = 5
  ): Promise<MountainFeatures> {
    try {
      if (!route.points || route.points.length === 0) {
        return this.getEmptyFeatures();
      }

      // 使用路线中心点
      const centerPoint = this.getRouteCenter(route.points);
      
      // 检查路线是否穿越山脉
      const routeLine = this.buildRouteLine(route.points);
      const intersectsMountain = await this.checkRouteIntersectsMountain(routeLine);
      
      // 获取中心点的山脉特征
      const pointFeatures = await this.getMountainFeaturesForPoint(
        centerPoint.lat,
        centerPoint.lng,
        densityBufferKm
      );
      
      return {
        ...pointFeatures,
        inMountain: intersectsMountain || pointFeatures.inMountain,
      };
    } catch (error) {
      this.logger.error('获取路线山脉特征失败:', error);
      return this.getEmptyFeatures();
    }
  }

  /**
   * 检查点位是否在山脉区域内
   */
  private async checkInMountain(lat: number, lng: number): Promise<{ inMountain: boolean }> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Contains(
            geom,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
          );
      `;

      return {
        inMountain: Number(result[0]?.count || 0) > 0,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        this.logger.warn('geo_mountains_standard 表不存在，请先导入山脉数据');
        return { inMountain: false };
      }
      throw error;
    }
  }

  /**
   * 获取点位所在山脉的海拔信息
   */
  private async getMountainElevation(
    lat: number,
    lng: number
  ): Promise<{ avg: number | null; max: number | null; min: number | null }> {
    try {
      // 从 properties JSONB 中提取海拔信息
      // 注意：字段名可能因数据源而异，需要根据实际 .dbf 文件调整
      const result = await this.prisma.$queryRaw<Array<{
        elevation_avg: number | null;
        elevation_max: number | null;
        elevation_min: number | null;
      }>>`
        SELECT 
          (properties->>'ELEV_AVG')::float as elevation_avg,
          (properties->>'ELEV_MAX')::float as elevation_max,
          (properties->>'ELEV_MIN')::float as elevation_min
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Contains(
            geom,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
          )
        LIMIT 1;
      `;

      if (result.length === 0) {
        return { avg: null, max: null, min: null };
      }

      return {
        avg: result[0].elevation_avg,
        max: result[0].elevation_max,
        min: result[0].elevation_min,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return { avg: null, max: null, min: null };
      }
      // 如果字段不存在，返回 null
      return { avg: null, max: null, min: null };
    }
  }

  /**
   * 获取山脉密度评分（0-1）
   * 
   * 基于 buffer 内山脉覆盖比例计算
   */
  private async getMountainDensityScore(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferMeters = bufferKm * 1000;
      
      // 计算 buffer 内山脉覆盖面积
      const result = await this.prisma.$queryRaw<Array<{
        coverage_area: number;
        buffer_area: number;
      }>>`
        SELECT 
          COALESCE(
            SUM(ST_Area(ST_Intersection(
              geom::geography,
              ST_Buffer(
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                ${bufferMeters}
              )
            ))),
            0
          ) as coverage_area,
          ST_Area(
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${bufferMeters}
            )
          ) as buffer_area
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${bufferMeters}
            )::geometry
          );
      `;

      if (result.length === 0 || !result[0].buffer_area) {
        return 0;
      }

      const coverageRatio = Number(result[0].coverage_area) / Number(result[0].buffer_area);
      return Math.min(Math.round(coverageRatio * 100) / 100, 1.0); // 保留2位小数，最大1.0
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return 0;
      }
      throw error;
    }
  }

  /**
   * 获取地形复杂度评分（0-1）
   * 
   * 基于山脉分布和海拔变化计算
   */
  private async getTerrainComplexity(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferMeters = bufferKm * 1000;
      
      // 计算 buffer 内山脉数量和海拔变化
      const result = await this.prisma.$queryRaw<Array<{
        mountain_count: bigint;
        elevation_range: number;
      }>>`
        SELECT 
          COUNT(*) as mountain_count,
          COALESCE(
            MAX((properties->>'ELEV_MAX')::float) - MIN((properties->>'ELEV_MIN')::float),
            0
          ) as elevation_range
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${bufferMeters}
            )::geometry
          );
      `;

      if (result.length === 0) {
        return 0;
      }

      const count = Number(result[0].mountain_count || 0);
      const elevationRange = Number(result[0].elevation_range || 0);
      
      // 归一化评分：
      // - 山脉数量：每10个山脉 = 0.1 分，最大 0.5
      // - 海拔变化：每1000米 = 0.1 分，最大 0.5
      const countScore = Math.min(count / 10 * 0.1, 0.5);
      const elevationScore = Math.min(elevationRange / 1000 * 0.1, 0.5);
      
      return Math.min(Math.round((countScore + elevationScore) * 100) / 100, 1.0);
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return 0;
      }
      throw error;
    }
  }

  /**
   * 获取到最近山脉的距离（米）
   */
  private async getNearestMountainDistance(
    lat: number,
    lng: number
  ): Promise<number | null> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        distance_m: number;
      }>>`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `;

      if (result.length === 0) {
        return null;
      }

      return Math.round(result[0].distance_m);
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 检查路线是否与山脉相交
   */
  private async checkRouteIntersectsMountain(routeLine: string): Promise<boolean> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM geo_mountains_standard
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_GeomFromText(${routeLine}, 4326)
          );
      `;

      return Number(result[0]?.count || 0) > 0;
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * 构建路线 LineString（WKT 格式）
   */
  private buildRouteLine(points: Point[]): string {
    if (points.length < 2) {
      throw new Error('路线至少需要2个点');
    }

    const coords = points.map(p => `${p.lng} ${p.lat}`).join(', ');
    return `LINESTRING(${coords})`;
  }

  /**
   * 获取路线中心点
   */
  private getRouteCenter(points: Point[]): Point {
    if (points.length === 0) {
      throw new Error('路线点序列为空');
    }

    if (points.length === 1) {
      return points[0];
    }

    // 使用中点
    const midIndex = Math.floor(points.length / 2);
    return points[midIndex];
  }

  /**
   * 返回空特征（默认值）
   */
  private getEmptyFeatures(): MountainFeatures {
    return {
      inMountain: false,
      mountainElevationAvg: null,
      mountainElevationMax: null,
      mountainElevationMin: null,
      mountainDensityScore: 0,
      terrainComplexity: 0,
      nearestMountainDistanceM: null,
    };
  }
}

