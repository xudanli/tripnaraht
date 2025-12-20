// src/trips/readiness/services/geo-facts-road.service.ts

/**
 * Geo Facts Road Service - 道路网络地理特征服务
 * 
 * 提供基于世界道路网络数据的核心特征计算：
 * 1. roadDensityScore - 道路密度评分
 * 2. nearestRoadDistanceM - 到最近道路的距离
 * 3. roadAccessibility - 道路可达性评分
 * 4. roadTypeDistribution - 道路类型分布
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

export interface RoadFeatures {
  /** 到最近道路的距离（米） */
  nearestRoadDistanceM: number | null;
  /** 是否靠近道路（默认阈值 500m） */
  nearRoad: boolean;
  /** 道路密度评分（0-1，基于 buffer 内道路总长度） */
  roadDensityScore: number;
  /** 道路可达性评分（0-1，基于道路密度和类型） */
  roadAccessibility: number;
  /** 主要道路类型（从属性中提取） */
  primaryRoadType: string | null;
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
export class GeoFactsRoadService {
  private readonly logger = new Logger(GeoFactsRoadService.name);

  constructor(private readonly prisma: PrismaService | PrismaClient) {}

  /**
   * 获取点位的道路网络特征
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param nearRoadThresholdM 靠近道路的阈值（米），默认 500m
   * @param densityBufferKm 道路密度计算的缓冲区半径（公里），默认 5km
   */
  async getRoadFeaturesForPoint(
    lat: number,
    lng: number,
    nearRoadThresholdM: number = 500,
    densityBufferKm: number = 5
  ): Promise<RoadFeatures> {
    try {
      // 1. 计算到最近道路的距离
      const nearestRoad = await this.getNearestRoadDistance(lat, lng);
      
      // 2. 计算道路密度
      const densityScore = await this.getRoadDensityScore(
        lat,
        lng,
        densityBufferKm
      );
      
      // 3. 计算道路可达性
      const accessibility = await this.getRoadAccessibility(
        lat,
        lng,
        densityBufferKm
      );
      
      // 4. 获取主要道路类型
      const primaryRoadType = await this.getPrimaryRoadType(lat, lng);
      
      return {
        nearestRoadDistanceM: nearestRoad,
        nearRoad: nearestRoad !== null && nearestRoad <= nearRoadThresholdM,
        roadDensityScore: densityScore,
        roadAccessibility: accessibility,
        primaryRoadType,
      };
    } catch (error) {
      this.logger.error(`获取点位道路特征失败 (${lat}, ${lng}):`, error);
      // 返回默认值
      return {
        nearestRoadDistanceM: null,
        nearRoad: false,
        roadDensityScore: 0,
        roadAccessibility: 0,
        primaryRoadType: null,
      };
    }
  }

  /**
   * 获取路线的道路网络特征
   * 
   * @param route 路线（点序列）
   * @param nearRoadThresholdM 靠近道路的阈值（米），默认 500m
   * @param densityBufferKm 道路密度计算的缓冲区半径（公里），默认 5km
   */
  async getRoadFeaturesForRoute(
    route: Route,
    nearRoadThresholdM: number = 500,
    densityBufferKm: number = 5
  ): Promise<RoadFeatures> {
    try {
      if (!route.points || route.points.length === 0) {
        return this.getEmptyFeatures();
      }

      // 使用路线中心点
      const centerPoint = this.getRouteCenter(route.points);
      
      // 获取中心点的道路特征
      return await this.getRoadFeaturesForPoint(
        centerPoint.lat,
        centerPoint.lng,
        nearRoadThresholdM,
        densityBufferKm
      );
    } catch (error) {
      this.logger.error('获取路线道路特征失败:', error);
      return this.getEmptyFeatures();
    }
  }

  /**
   * 获取到最近道路的距离（米）
   */
  private async getNearestRoadDistance(
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
        FROM geo_roads
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
        this.logger.warn('geo_roads 表不存在，请先导入道路数据');
        return null;
      }
      throw error;
    }
  }

  /**
   * 获取道路密度评分（0-1）
   * 
   * 基于 buffer 内道路总长度计算
   */
  private async getRoadDensityScore(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferMeters = bufferKm * 1000;
      
      // 计算 buffer 内道路总长度
      const result = await this.prisma.$queryRaw<Array<{
        total_length_m: number;
      }>>`
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m
        FROM geo_roads
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;

      const totalLengthM = Number(result[0]?.total_length_m || 0);

      // 归一化评分：
      // 每 10 公里道路 = 0.1 分，最大 1.0
      const score = Math.min(totalLengthM / 10000, 1.0);
      
      return Math.round(score * 100) / 100; // 保留2位小数
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return 0;
      }
      throw error;
    }
  }

  /**
   * 获取道路可达性评分（0-1）
   * 
   * 基于道路密度和道路类型（高速公路权重更高）
   */
  private async getRoadAccessibility(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferMeters = bufferKm * 1000;
      
      // 计算 buffer 内不同类型道路的长度
      // 注意：字段名可能因数据源而异，需要根据实际 .dbf 文件调整
      const result = await this.prisma.$queryRaw<Array<{
        total_length_m: number;
        highway_length_m: number;
      }>>`
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m,
          COALESCE(SUM(
            CASE 
              WHEN properties->>'TYPE' = 'highway' 
                OR properties->>'TYPE' = 'motorway'
                OR properties->>'TYPE' = 'trunk'
              THEN ST_Length(geom::geography)
              ELSE 0
            END
          ), 0) as highway_length_m
        FROM geo_roads
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;

      const totalLengthM = Number(result[0]?.total_length_m || 0);
      const highwayLengthM = Number(result[0]?.highway_length_m || 0);

      if (totalLengthM === 0) {
        return 0;
      }

      // 可达性评分：
      // - 基础：总道路长度 / 10000
      // - 加权：高速公路长度 * 2 / 10000
      const baseScore = Math.min(totalLengthM / 10000, 0.6);
      const highwayScore = Math.min(highwayLengthM * 2 / 10000, 0.4);
      
      return Math.min(Math.round((baseScore + highwayScore) * 100) / 100, 1.0);
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return 0;
      }
      // 如果字段不存在，使用基础密度评分
      return await this.getRoadDensityScore(lat, lng, bufferKm);
    }
  }

  /**
   * 获取主要道路类型
   */
  private async getPrimaryRoadType(
    lat: number,
    lng: number
  ): Promise<string | null> {
    try {
      // 查找最近道路的类型
      const result = await this.prisma.$queryRaw<Array<{
        road_type: string;
      }>>`
        SELECT 
          properties->>'TYPE' as road_type
        FROM geo_roads
        WHERE geom IS NOT NULL
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `;

      if (result.length === 0) {
        return null;
      }

      return result[0].road_type || null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return null;
      }
      return null;
    }
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
  private getEmptyFeatures(): RoadFeatures {
    return {
      nearestRoadDistanceM: null,
      nearRoad: false,
      roadDensityScore: 0,
      roadAccessibility: 0,
      primaryRoadType: null,
    };
  }
}

