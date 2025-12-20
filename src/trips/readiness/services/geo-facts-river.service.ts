// src/trips/readiness/services/geo-facts-river.service.ts

/**
 * Geo Facts River Service - 河网地理特征服务
 * 
 * 提供基于河网数据的4个核心特征计算：
 * 1. nearRiver - 点到最近河线的距离
 * 2. riverCrossingCount - 路线穿越河流次数
 * 3. riverDensityScore - 河网密度评分
 * 4. nearWaterPolygon - 是否靠近面状水域
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface RiverFeatures {
  /** 到最近河线的距离（米） */
  nearestRiverDistanceM: number | null;
  /** 是否靠近河网（默认阈值 500m） */
  nearRiver: boolean;
  /** 路线穿越河流次数 */
  riverCrossingCount: number;
  /** 河网密度评分（0-1，基于 buffer 内河线总长度） */
  riverDensityScore: number;
  /** 是否靠近面状水域 */
  nearWaterPolygon: boolean;
  /** 到最近面状水域的距离（米） */
  nearestWaterPolygonDistanceM: number | null;
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
export class GeoFactsRiverService {
  private readonly logger = new Logger(GeoFactsRiverService.name);

  constructor(private readonly prisma: PrismaService | PrismaClient) {}

  /**
   * 获取点位的河网特征
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param nearRiverThresholdM 靠近河网的阈值（米），默认 500m
   * @param densityBufferKm 河网密度计算的缓冲区半径（公里），默认 2km
   * @param nearWaterThresholdM 靠近水域的阈值（米），默认 200m
   */
  async getRiverFeaturesForPoint(
    lat: number,
    lng: number,
    nearRiverThresholdM: number = 500,
    densityBufferKm: number = 2,
    nearWaterThresholdM: number = 200
  ): Promise<RiverFeatures> {
    try {
      // 1. 计算到最近河线的距离
      const nearestRiver = await this.getNearestRiverDistance(lat, lng);
      
      // 2. 计算河网密度
      const densityScore = await this.getRiverDensityScore(
        lat,
        lng,
        densityBufferKm
      );
      
      // 3. 计算到最近面状水域的距离
      const nearestWater = await this.getNearestWaterPolygonDistance(lat, lng);
      
      return {
        nearestRiverDistanceM: nearestRiver,
        nearRiver: nearestRiver !== null && nearestRiver <= nearRiverThresholdM,
        riverCrossingCount: 0, // 单点无法计算穿越次数
        riverDensityScore: densityScore,
        nearWaterPolygon: nearestWater !== null && nearestWater <= nearWaterThresholdM,
        nearestWaterPolygonDistanceM: nearestWater,
      };
    } catch (error) {
      this.logger.error(`获取点位河网特征失败 (${lat}, ${lng}):`, error);
      // 返回默认值
      return {
        nearestRiverDistanceM: null,
        nearRiver: false,
        riverCrossingCount: 0,
        riverDensityScore: 0,
        nearWaterPolygon: false,
        nearestWaterPolygonDistanceM: null,
      };
    }
  }

  /**
   * 获取路线的河网特征
   * 
   * @param route 路线（点序列）
   * @param nearRiverThresholdM 靠近河网的阈值（米），默认 500m
   * @param densityBufferKm 河网密度计算的缓冲区半径（公里），默认 2km
   */
  async getRiverFeaturesForRoute(
    route: Route,
    nearRiverThresholdM: number = 500,
    densityBufferKm: number = 2
  ): Promise<RiverFeatures> {
    try {
      if (!route.points || route.points.length === 0) {
        return this.getEmptyFeatures();
      }

      // 1. 构建路线 polyline
      const routeLine = this.buildRouteLine(route.points);
      
      // 2. 计算穿越次数
      const crossingCount = await this.getRiverCrossingCount(routeLine);
      
      // 3. 计算路线中点附近的河网密度（使用路线中心点）
      const centerPoint = this.getRouteCenter(route.points);
      const densityScore = await this.getRiverDensityScore(
        centerPoint.lat,
        centerPoint.lng,
        densityBufferKm
      );
      
      // 4. 计算路线到最近河线的距离（使用路线中心点）
      const nearestRiver = await this.getNearestRiverDistance(
        centerPoint.lat,
        centerPoint.lng
      );
      
      // 5. 计算路线到最近面状水域的距离
      const nearestWater = await this.getNearestWaterPolygonDistance(
        centerPoint.lat,
        centerPoint.lng
      );
      
      return {
        nearestRiverDistanceM: nearestRiver,
        nearRiver: nearestRiver !== null && nearestRiver <= nearRiverThresholdM,
        riverCrossingCount: crossingCount,
        riverDensityScore: densityScore,
        nearWaterPolygon: nearestWater !== null && nearestWater <= 200,
        nearestWaterPolygonDistanceM: nearestWater,
      };
    } catch (error) {
      this.logger.error('获取路线河网特征失败:', error);
      return this.getEmptyFeatures();
    }
  }

  /**
   * 获取到最近河线的距离（米）
   */
  private async getNearestRiverDistance(
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
        FROM geo_rivers_line
        WHERE geom IS NOT NULL
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `;

      if (result.length === 0) {
        return null;
      }

      return Math.round(result[0].distance_m);
    } catch (error) {
      // 如果表不存在，返回 null
      if (error instanceof Error && error.message.includes('does not exist')) {
        this.logger.warn('geo_rivers_line 表不存在，请先导入河网数据');
        return null;
      }
      throw error;
    }
  }

  /**
   * 获取路线穿越河流次数
   */
  private async getRiverCrossingCount(routeLine: string): Promise<number> {
    try {
      // 使用 ST_Intersects 计算相交次数
      // 注意：需要去重，同一条河段只算一次
      const result = await this.prisma.$queryRaw<Array<{
        count: bigint;
      }>>`
        SELECT COUNT(DISTINCT gid) as count
        FROM geo_rivers_line
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_GeomFromText(${routeLine}, 4326)
          );
      `;

      return Number(result[0]?.count || 0);
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        this.logger.warn('geo_rivers_line 表不存在，请先导入河网数据');
        return 0;
      }
      throw error;
    }
  }

  /**
   * 获取河网密度评分（0-1）
   * 
   * 基于 buffer 内河线总长度计算
   */
  private async getRiverDensityScore(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferMeters = bufferKm * 1000;
      
      // 计算 buffer 内河线总长度
      const result = await this.prisma.$queryRaw<Array<{
        total_length_m: number;
        segment_count: bigint;
      }>>`
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m,
          COUNT(*) as segment_count
        FROM geo_rivers_line
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;

      const totalLengthM = Number(result[0]?.total_length_m || 0);
      const segmentCount = Number(result[0]?.segment_count || 0);

      // 归一化评分：
      // - 基于总长度：每公里河线 = 0.1 分，最大 1.0
      // - 或基于密度：长度 / (buffer面积) * 权重
      // 这里使用简化版本：总长度 / 10000 米 = 1.0 分
      const score = Math.min(totalLengthM / 10000, 1.0);
      
      return Math.round(score * 100) / 100; // 保留2位小数
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        this.logger.warn('geo_rivers_line 表不存在，请先导入河网数据');
        return 0;
      }
      throw error;
    }
  }

  /**
   * 获取到最近面状水域的距离（米）
   */
  private async getNearestWaterPolygonDistance(
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
        FROM geo_water_poly
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
        this.logger.warn('geo_water_poly 表不存在，请先导入面状水系数据');
        return null;
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
  private getEmptyFeatures(): RiverFeatures {
    return {
      nearestRiverDistanceM: null,
      nearRiver: false,
      riverCrossingCount: 0,
      riverDensityScore: 0,
      nearWaterPolygon: false,
      nearestWaterPolygonDistanceM: null,
    };
  }
}

