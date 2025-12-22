// src/trips/readiness/services/geo-facts-airline.service.ts

/**
 * Geo Facts Airline Service - 航线地理特征服务
 * 
 * 提供基于全球航线数据的核心特征计算：
 * 1. nearAirport - 点位是否靠近机场（点数据）
 * 2. nearestAirportDistanceM - 到最近机场的距离
 * 3. airlineDensityScore - 航线/机场密度评分
 * 4. nearestAirportName - 最近机场的名称
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

export interface AirlineFeatures {
  /** 到最近机场的距离（米） */
  nearestAirportDistanceM: number | null;
  /** 是否靠近机场（默认阈值 20km） */
  nearAirport: boolean;
  /** 航线/机场密度评分（0-1，基于 buffer 内机场数量或航线长度） */
  airlineDensityScore: number;
  /** 最近机场的名称 */
  nearestAirportName: string | null;
  /** 最近机场的属性信息 */
  nearestAirportProperties: Record<string, any> | null;
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
export class GeoFactsAirlineService {
  private readonly logger = new Logger(GeoFactsAirlineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取点位的航线特征
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param nearAirportThresholdKm 靠近机场的阈值（公里），默认 20km
   * @param densityBufferKm 航线/机场密度计算的缓冲区半径（公里），默认 100km
   */
  async getAirlineFeaturesForPoint(
    lat: number,
    lng: number,
    nearAirportThresholdKm: number = 20,
    densityBufferKm: number = 100
  ): Promise<AirlineFeatures> {
    try {
      // 1. 查找最近机场及其距离（优先查找点数据）
      const nearestAirport = await this.getNearestAirport(lat, lng);
      
      // 2. 计算航线/机场密度
      const densityScore = await this.getAirlineDensityScore(
        lat,
        lng,
        densityBufferKm
      );
      
      const nearAirportThresholdM = nearAirportThresholdKm * 1000;
      
      return {
        nearestAirportDistanceM: nearestAirport?.distanceM ?? null,
        nearAirport: nearestAirport !== null && nearestAirport.distanceM <= nearAirportThresholdM,
        airlineDensityScore: densityScore,
        nearestAirportName: nearestAirport?.name ?? null,
        nearestAirportProperties: nearestAirport?.properties ?? null,
      };
    } catch (error) {
      this.logger.error(`获取点位航线特征失败 (${lat}, ${lng}):`, error);
      // 返回默认值
      return {
        nearestAirportDistanceM: null,
        nearAirport: false,
        airlineDensityScore: 0,
        nearestAirportName: null,
        nearestAirportProperties: null,
      };
    }
  }

  /**
   * 获取路线的航线特征
   * 
   * @param route 路线（点序列）
   * @param nearAirportThresholdKm 靠近机场的阈值（公里），默认 20km
   * @param densityBufferKm 航线/机场密度计算的缓冲区半径（公里），默认 100km
   */
  async getAirlineFeaturesForRoute(
    route: Route,
    nearAirportThresholdKm: number = 20,
    densityBufferKm: number = 100
  ): Promise<AirlineFeatures> {
    try {
      // 计算路线中心点
      const centerLat = route.points.reduce((sum, p) => sum + p.lat, 0) / route.points.length;
      const centerLng = route.points.reduce((sum, p) => sum + p.lng, 0) / route.points.length;
      
      // 使用中心点查询航线特征
      return await this.getAirlineFeaturesForPoint(
        centerLat,
        centerLng,
        nearAirportThresholdKm,
        densityBufferKm
      );
    } catch (error) {
      this.logger.error(`获取路线航线特征失败:`, error);
      return {
        nearestAirportDistanceM: null,
        nearAirport: false,
        airlineDensityScore: 0,
        nearestAirportName: null,
        nearestAirportProperties: null,
      };
    }
  }

  /**
   * 获取最近机场及其距离
   * 优先查找点数据（机场），如果没有点数据则查找最近的线数据（航线）上的点
   */
  private async getNearestAirport(
    lat: number,
    lng: number
  ): Promise<{ distanceM: number; name: string | null; properties: Record<string, any> | null } | null> {
    try {
      // 首先尝试查找点数据（机场）
      const pointResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m,
          properties,
          ST_GeometryType(geom) as geom_type
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_Point', 'ST_MultiPoint')
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);

      if (pointResult && pointResult.length > 0 && pointResult[0]) {
        const properties = pointResult[0].properties;
        return {
          distanceM: Math.round(pointResult[0].distance_m),
          name: this.extractAirportNameFromProperties(properties),
          properties: properties,
        };
      }

      // 如果没有点数据，查找最近的线数据（航线）上的最近点
      const lineResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m,
          properties
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_LineString', 'ST_MultiLineString')
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);

      if (lineResult && lineResult.length > 0 && lineResult[0]) {
        const properties = lineResult[0].properties;
        return {
          distanceM: Math.round(lineResult[0].distance_m),
          name: this.extractAirportNameFromProperties(properties),
          properties: properties,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`查询最近机场失败:`, error);
      return null;
    }
  }

  /**
   * 从属性中提取机场名称
   */
  private extractAirportNameFromProperties(properties: any): string | null {
    if (!properties || typeof properties !== 'object') {
      return null;
    }

    // 尝试多个可能的字段名（包括中文字段名）
    const nameFields = [
      '机场名称',
      'airport_name',
      'AIRPORT_NAME',
      'AirportName',
      'name',
      'NAME',
      'Name',
      '名称',
      'IATA',  // 机场代码也可以作为标识
      'ICAO',
    ];
    
    for (const field of nameFields) {
      if (properties[field]) {
        const value = String(properties[field]);
        // 如果值不为空，返回它
        if (value && value.trim() !== '') {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * 计算航线/机场密度评分
   * 
   * 基于 buffer 内的机场数量（点数据）或航线总长度（线数据），归一化到 0-1
   */
  private async getAirlineDensityScore(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferM = bufferKm * 1000;
      
      // 首先尝试计算点数据（机场）数量
      const pointCountResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_Point', 'ST_MultiPoint')
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferM}
          );
      `);

      const pointCount = pointCountResult && pointCountResult.length > 0 ? Number(pointCountResult[0].count) : 0;
      
      if (pointCount > 0) {
        // 使用机场数量计算密度
        // 假设：0 个机场 = 0，5+ 个机场 = 1.0
        const maxExpectedAirports = 5;
        return Math.min(pointCount / maxExpectedAirports, 1.0);
      }

      // 如果没有点数据，使用线数据（航线）总长度
      const lineLengthResult = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m
        FROM geo_airlines
        WHERE ST_GeometryType(geom) IN ('ST_LineString', 'ST_MultiLineString')
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${bufferM}
          );
      `);

      const totalLengthM = lineLengthResult && lineLengthResult.length > 0 ? Number(lineLengthResult[0].total_length_m) : 0;
      
      // 归一化到 0-1
      // 假设：每 1000 公里航线 = 0.1 分，最大 1.0
      const maxExpectedLength = 10000; // 10,000 公里
      return Math.min(totalLengthM / maxExpectedLength, 1.0);
    } catch (error) {
      this.logger.error(`计算航线密度失败:`, error);
      return 0;
    }
  }
}

