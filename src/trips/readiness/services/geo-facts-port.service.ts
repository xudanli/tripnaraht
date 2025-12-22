// src/trips/readiness/services/geo-facts-port.service.ts

/**
 * Geo Facts Port Service - 港口地理特征服务
 * 
 * 提供基于全球港口数据的核心特征计算：
 * 1. nearPort - 点位是否靠近港口
 * 2. nearestPortDistanceM - 到最近港口的距离
 * 3. portDensityScore - 港口密度评分
 * 4. nearestPortName - 最近港口的名称
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

export interface PortFeatures {
  /** 到最近港口的距离（米） */
  nearestPortDistanceM: number | null;
  /** 是否靠近港口（默认阈值 10km） */
  nearPort: boolean;
  /** 港口密度评分（0-1，基于 buffer 内港口数量） */
  portDensityScore: number;
  /** 最近港口的名称 */
  nearestPortName: string | null;
  /** 最近港口的属性信息 */
  nearestPortProperties: Record<string, any> | null;
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
export class GeoFactsPortService {
  private readonly logger = new Logger(GeoFactsPortService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取点位的港口特征
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param nearPortThresholdKm 靠近港口的阈值（公里），默认 10km
   * @param densityBufferKm 港口密度计算的缓冲区半径（公里），默认 50km
   */
  async getPortFeaturesForPoint(
    lat: number,
    lng: number,
    nearPortThresholdKm: number = 10,
    densityBufferKm: number = 50
  ): Promise<PortFeatures> {
    try {
      // 1. 查找最近港口及其距离
      const nearestPort = await this.getNearestPort(lat, lng);
      
      // 2. 计算港口密度
      const densityScore = await this.getPortDensityScore(
        lat,
        lng,
        densityBufferKm
      );
      
      const nearPortThresholdM = nearPortThresholdKm * 1000;
      
      return {
        nearestPortDistanceM: nearestPort?.distanceM ?? null,
        nearPort: nearestPort !== null && nearestPort.distanceM <= nearPortThresholdM,
        portDensityScore: densityScore,
        nearestPortName: nearestPort?.name ?? null,
        nearestPortProperties: nearestPort?.properties ?? null,
      };
    } catch (error) {
      this.logger.error(`获取点位港口特征失败 (${lat}, ${lng}):`, error);
      // 返回默认值
      return {
        nearestPortDistanceM: null,
        nearPort: false,
        portDensityScore: 0,
        nearestPortName: null,
        nearestPortProperties: null,
      };
    }
  }

  /**
   * 获取路线的港口特征
   * 
   * @param route 路线（点序列）
   * @param nearPortThresholdKm 靠近港口的阈值（公里），默认 10km
   * @param densityBufferKm 港口密度计算的缓冲区半径（公里），默认 50km
   */
  async getPortFeaturesForRoute(
    route: Route,
    nearPortThresholdKm: number = 10,
    densityBufferKm: number = 50
  ): Promise<PortFeatures> {
    try {
      // 计算路线中心点
      const centerLat = route.points.reduce((sum, p) => sum + p.lat, 0) / route.points.length;
      const centerLng = route.points.reduce((sum, p) => sum + p.lng, 0) / route.points.length;
      
      // 使用中心点查询港口特征
      return await this.getPortFeaturesForPoint(
        centerLat,
        centerLng,
        nearPortThresholdKm,
        densityBufferKm
      );
    } catch (error) {
      this.logger.error(`获取路线港口特征失败:`, error);
      return {
        nearestPortDistanceM: null,
        nearPort: false,
        portDensityScore: 0,
        nearestPortName: null,
        nearestPortProperties: null,
      };
    }
  }

  /**
   * 获取最近港口及其距离
   */
  private async getNearestPort(
    lat: number,
    lng: number
  ): Promise<{ distanceM: number; name: string | null; properties: Record<string, any> | null } | null> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m,
          properties
        FROM geo_ports
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `);

      if (result && result.length > 0 && result[0]) {
        const properties = result[0].properties;
        return {
          distanceM: Math.round(result[0].distance_m),
          name: this.extractPortNameFromProperties(properties),
          properties: properties,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`查询最近港口失败:`, error);
      return null;
    }
  }

  /**
   * 从属性中提取港口名称
   */
  private extractPortNameFromProperties(properties: any): string | null {
    if (!properties || typeof properties !== 'object') {
      return null;
    }

    // 尝试多个可能的字段名（包括中文字段名）
    const nameFields = [
      '港口名称',  // 中文字段名
      'name', 
      'NAME', 
      'Name', 
      'port_name', 
      'PORT_NAME', 
      'PortName',
      '名称',
      'UN_LOCODE',  // UN 港口代码也可以作为标识
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
   * 计算港口密度评分
   * 
   * 基于 buffer 内的港口数量，归一化到 0-1
   */
  private async getPortDensityScore(
    lat: number,
    lng: number,
    bufferKm: number
  ): Promise<number> {
    try {
      const bufferM = bufferKm * 1000;
      
      // 计算 buffer 内的港口数量
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM geo_ports
        WHERE ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${bufferM}
        );
      `) as Array<{ count: bigint }>;

      const count = result && result.length > 0 ? Number(result[0].count) : 0;
      
      // 归一化到 0-1
      // 假设：0 个港口 = 0，10+ 个港口 = 1.0
      // 可以根据实际数据分布调整
      const maxExpectedPorts = 10;
      return Math.min(count / maxExpectedPorts, 1.0);
    } catch (error) {
      this.logger.error(`计算港口密度失败:`, error);
      return 0;
    }
  }
}

