// src/trips/readiness/services/geo-facts-coastline.service.ts

/**
 * Geo Facts Coastline Service - 海岸线地理特征服务
 * 
 * 提供基于世界海岸线数据的核心特征计算：
 * 1. nearCoastline - 点位是否靠近海岸线
 * 2. nearestCoastlineDistanceM - 到最近海岸线的距离
 * 3. coastlineDensityScore - 海岸线密度评分
 * 4. isCoastalArea - 是否在沿海区域
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

export interface CoastlineFeatures {
  /** 到最近海岸线的距离（米） */
  nearestCoastlineDistanceM: number | null;
  /** 是否靠近海岸线（默认阈值 5km） */
  nearCoastline: boolean;
  /** 是否在沿海区域（默认阈值 50km） */
  isCoastalArea: boolean;
  /** 海岸线密度评分（0-1，基于 buffer 内海岸线总长度） */
  coastlineDensityScore: number;
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
export class GeoFactsCoastlineService {
  private readonly logger = new Logger(GeoFactsCoastlineService.name);

  constructor(private readonly prisma: PrismaService | PrismaClient) {}

  /**
   * 获取点位的海岸线特征
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param nearCoastlineThresholdKm 靠近海岸线的阈值（公里），默认 5km
   * @param coastalAreaThresholdKm 沿海区域的阈值（公里），默认 50km
   * @param densityBufferKm 海岸线密度计算的缓冲区半径（公里），默认 10km
   */
  async getCoastlineFeaturesForPoint(
    lat: number,
    lng: number,
    nearCoastlineThresholdKm: number = 5,
    coastalAreaThresholdKm: number = 50,
    densityBufferKm: number = 10
  ): Promise<CoastlineFeatures> {
    try {
      // 1. 计算到最近海岸线的距离
      const nearestDistance = await this.getNearestCoastlineDistance(lat, lng);
      
      // 2. 计算海岸线密度
      const densityScore = await this.getCoastlineDensityScore(
        lat,
        lng,
        densityBufferKm
      );
      
      const nearCoastlineThresholdM = nearCoastlineThresholdKm * 1000;
      const coastalAreaThresholdM = coastalAreaThresholdKm * 1000;
      
      return {
        nearestCoastlineDistanceM: nearestDistance,
        nearCoastline: nearestDistance !== null && nearestDistance <= nearCoastlineThresholdM,
        isCoastalArea: nearestDistance !== null && nearestDistance <= coastalAreaThresholdM,
        coastlineDensityScore: densityScore,
      };
    } catch (error) {
      this.logger.error(`获取点位海岸线特征失败 (${lat}, ${lng}):`, error);
      // 返回默认值
      return {
        nearestCoastlineDistanceM: null,
        nearCoastline: false,
        isCoastalArea: false,
        coastlineDensityScore: 0,
      };
    }
  }

  /**
   * 获取路线的海岸线特征
   * 
   * @param route 路线（点序列）
   * @param nearCoastlineThresholdKm 靠近海岸线的阈值（公里），默认 5km
   * @param coastalAreaThresholdKm 沿海区域的阈值（公里），默认 50km
   * @param densityBufferKm 海岸线密度计算的缓冲区半径（公里），默认 10km
   */
  async getCoastlineFeaturesForRoute(
    route: Route,
    nearCoastlineThresholdKm: number = 5,
    coastalAreaThresholdKm: number = 50,
    densityBufferKm: number = 10
  ): Promise<CoastlineFeatures> {
    try {
      if (!route.points || route.points.length === 0) {
        return this.getEmptyFeatures();
      }

      // 使用路线中心点
      const centerPoint = this.getRouteCenter(route.points);
      
      return await this.getCoastlineFeaturesForPoint(
        centerPoint.lat,
        centerPoint.lng,
        nearCoastlineThresholdKm,
        coastalAreaThresholdKm,
        densityBufferKm
      );
    } catch (error) {
      this.logger.error('获取路线海岸线特征失败:', error);
      return this.getEmptyFeatures();
    }
  }

  /**
   * 获取到最近海岸线的距离（米）
   */
  private async getNearestCoastlineDistance(
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
        FROM geo_coastlines
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
        this.logger.warn('geo_coastlines 表不存在，请先导入海岸线数据');
        return null;
      }
      throw error;
    }
  }

  /**
   * 获取海岸线密度评分（0-1）
   * 
   * 基于 buffer 内海岸线总长度计算
   */
  private async getCoastlineDensityScore(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferMeters = bufferKm * 1000;
      
      // 计算 buffer 内海岸线总长度
      const result = await this.prisma.$queryRaw<Array<{
        total_length_m: number;
      }>>`
        SELECT 
          COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m
        FROM geo_coastlines
        WHERE geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferMeters}
          );
      `;

      const totalLengthM = Number(result[0]?.total_length_m || 0);

      // 归一化评分：
      // 每 20 公里海岸线 = 0.1 分，最大 1.0
      const score = Math.min(totalLengthM / 20000, 1.0);
      
      return Math.round(score * 100) / 100; // 保留2位小数
    } catch (error) {
      if (error instanceof Error && error.message.includes('does not exist')) {
        return 0;
      }
      throw error;
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
  private getEmptyFeatures(): CoastlineFeatures {
    return {
      nearestCoastlineDistanceM: null,
      nearCoastline: false,
      isCoastalArea: false,
      coastlineDensityScore: 0,
    };
  }
}

