// src/skills/geo/geo-check-hazard-zones.skill.ts
/**
 * tripnara.geo.checkHazardZones
 * 
 * P1: 检查危险区域
 * 
 * 功能：Abu 统一读取危险区域信息，检查路线是否经过危险区域
 * 提供受控的 PostGIS 查询接口
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { HazardZoneState } from '../../trips/decision/models/physical-reality.model';

export interface GeoCheckHazardZonesInput extends BaseSkillInput {
  /** 路线点数组（检查路线是否经过危险区域） */
  route: Array<{ lat: number; lng: number }>;
  
  /** 国家代码 */
  countryCode: string;
  
  /** 月份（1-12，用于季节性过滤） */
  month?: number;
  
  /** 危险等级过滤（可选） */
  minLevel?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 危险类型过滤（可选） */
  hazardTypes?: Array<'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER'>;
  
  /** 缓冲半径（米，默认 1000m，用于检查路线是否接近危险区域） */
  bufferRadius?: number;
}

export interface GeoCheckHazardZonesOutput extends SkillOutput {
  /** 检测到的危险区域 */
  hazardZones: Array<{
    zoneId: string;
    type: 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER';
    level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    location?: { lat: number; lng: number };
    seasonality?: {
      highRiskMonths: number[];
      lowRiskMonths: number[];
    };
    description?: string;
    metadata?: Record<string, any>;
  }>;
  
  /** 路线风险评估 */
  riskAssessment: {
    hasHighRisk: boolean;
    hasMediumRisk: boolean;
    totalHazards: number;
    highRiskCount: number;
    mediumRiskCount: number;
    affectedSegments: number;
  };
  
  /** 查询摘要 */
  summary: {
    routeLength: number; // 路线点数
    checkedZones: number;
    queryTime: number;
  };
}

@Injectable()
export class GeoCheckHazardZonesSkill
  implements Skill<GeoCheckHazardZonesInput, GeoCheckHazardZonesOutput>
{
  private readonly logger = new Logger(GeoCheckHazardZonesSkill.name);

  metadata = {
    name: 'geo.checkHazardZones',
    description: 'geo.checkHazardZones：检查危险区域：Abu 统一读取危险区域信息，检查路线是否经过危险区域',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(@Optional() private readonly prisma?: PrismaService) {
    if (!this.prisma) {
      this.logger.warn('PrismaService 未注入，geo.checkHazardZones 功能将受限');
    }
  }

  async execute(
    input: GeoCheckHazardZonesInput,
  ): Promise<GeoCheckHazardZonesOutput> {
    const startTime = Date.now();
    this.logger.debug(
      `执行 geo.checkHazardZones: countryCode=${input.countryCode}, routePoints=${input.route.length}`,
    );

    try {
      if (!this.prisma) {
        throw new Error('PrismaService 未注入，无法执行查询');
      }

      // 1. 安全控制：限制路线点数量和缓冲半径
      const MAX_ROUTE_POINTS = 5000;
      const MAX_BUFFER_RADIUS = 10000; // 10km
      const validatedBufferRadius = Math.min(input.bufferRadius || 1000, MAX_BUFFER_RADIUS);

      if (input.route.length < 2) {
        throw new Error('路线点数组至少需要 2 个点');
      }
      if (input.route.length > MAX_ROUTE_POINTS) {
        throw new Error(`路线点数量不能超过 ${MAX_ROUTE_POINTS} 个`);
      }

      // 2. 从数据库查询危险区域
      const dbHazardZones = await this.queryHazardZonesFromDatabase(
        input.route,
        input.countryCode,
        input.month,
        input.minLevel,
        input.hazardTypes,
        validatedBufferRadius,
      );

      // 3. 转换为输出格式
      const hazardZones: GeoCheckHazardZonesOutput['hazardZones'] = dbHazardZones.map((zone) => {
        // 提取位置信息（如果 geom 是 Point）
        let location: { lat: number; lng: number } | undefined;
        if (zone.geom) {
          try {
            // 如果 geom 是 Point，提取坐标
            // 注意：这里假设 geom 是 Point，实际可能是 Polygon 或 LineString
            // 对于复杂几何，可以使用 ST_Centroid 或 ST_PointOnSurface
            // 这里简化处理，实际应该根据几何类型处理
            if (typeof zone.geom === 'object' && 'coordinates' in zone.geom) {
              const coords = (zone.geom as any).coordinates;
              if (Array.isArray(coords) && coords.length >= 2) {
                location = { lng: coords[0], lat: coords[1] };
              }
            }
          } catch (error) {
            this.logger.warn(`无法提取危险区域 ${zone.zoneId} 的位置信息`);
          }
        }

        return {
          zoneId: zone.zoneId,
          type: zone.type,
          level: zone.level,
          location,
          seasonality: zone.seasonality,
          description: zone.metadata?.description as string | undefined,
          metadata: zone.metadata,
        };
      });

      // 3. 构建风险评估
      const highRiskZones = hazardZones.filter((z) => z.level === 'HIGH');
      const mediumRiskZones = hazardZones.filter((z) => z.level === 'MEDIUM');

      // 4. 检查季节性风险（如果提供了月份）
      const seasonalHighRiskZones = input.month
        ? highRiskZones.filter((z) =>
            z.seasonality?.highRiskMonths?.includes(input.month!),
          )
        : highRiskZones;

      const riskAssessment: GeoCheckHazardZonesOutput['riskAssessment'] = {
        hasHighRisk: seasonalHighRiskZones.length > 0,
        hasMediumRisk: mediumRiskZones.length > 0,
        totalHazards: hazardZones.length,
        highRiskCount: seasonalHighRiskZones.length,
        mediumRiskCount: mediumRiskZones.length,
        affectedSegments: hazardZones.length, // 简化：每个危险区域影响一个路段
      };

      const queryTime = Date.now() - startTime;
      this.logger.debug(
        `geo.checkHazardZones 查询完成: 找到 ${hazardZones.length} 个危险区域，耗时 ${queryTime}ms`,
      );

      return {
        hazardZones,
        riskAssessment,
        summary: {
          routeLength: input.route.length,
          checkedZones: hazardZones.length,
          queryTime,
        },
      };
    } catch (error: any) {
      this.logger.error(`geo.checkHazardZones 查询失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 从数据库查询危险区域
   * 
   * 使用 PostGIS 查询路线是否经过或接近危险区域
   * 根据月份和季节性过滤
   */
  private async queryHazardZonesFromDatabase(
    route: Array<{ lat: number; lng: number }>,
    countryCode: string,
    month?: number,
    minLevel?: string,
    hazardTypes?: string[],
    bufferRadius: number = 1000,
  ): Promise<HazardZoneState[]> {
    if (!this.prisma) {
      this.logger.warn('PrismaService 未注入，无法查询危险区域');
      return [];
    }

    try {
      // 1. 构建路线几何（使用 ST_MakeLine）
      // 将路线点转换为 PostGIS LineString
      const routePoints = route.map(
        (point) => Prisma.sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)`,
      );
      const routeLine = Prisma.sql`ST_MakeLine(ARRAY[${Prisma.join(routePoints, ', ')}]::geometry[])`;

      // 2. 构建过滤条件
      const levelFilter = minLevel
        ? Prisma.sql`AND (
          CASE hz.level
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'NONE' THEN 1
            ELSE 0
          END >= CASE ${minLevel}
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'NONE' THEN 1
            ELSE 0
          END
        )`
        : Prisma.sql``;

      const typeFilter = hazardTypes && hazardTypes.length > 0
        ? Prisma.sql`AND hz.type = ANY(${hazardTypes}::VARCHAR[])`
        : Prisma.sql``;

      // 3. 季节性过滤（如果提供了月份）
      // 检查月份是否在高风险月份列表中，或者不在低风险月份列表中
      const seasonalityFilter = month
        ? Prisma.sql`AND (
          hz.seasonality->'highRiskMonths' @> ${JSON.stringify([month])}::jsonb
          OR NOT (hz.seasonality->'lowRiskMonths' @> ${JSON.stringify([month])}::jsonb)
          OR hz.seasonality IS NULL
        )`
        : Prisma.sql``;

      // 4. 执行查询
      const results = await this.prisma.$queryRaw<Array<{
        id: string;
        zone_id: string;
        country_code: string;
        type: string;
        level: string;
        geom: any;
        seasonality: any;
        description: string | null;
        metadata: any;
      }>>`
        SELECT
          hz.id,
          hz.zone_id,
          hz.country_code,
          hz.type,
          hz.level,
          hz.geom,
          hz.seasonality,
          hz.description,
          hz.metadata
        FROM hazard_zones hz
        WHERE
          hz.country_code = ${countryCode}
          AND hz.geom IS NOT NULL
          AND ST_DWithin(
            hz.geom::geography,
            ${routeLine}::geography,
            ${bufferRadius}
          )
          ${levelFilter}
          ${typeFilter}
          ${seasonalityFilter}
        ORDER BY
          CASE hz.level
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'NONE' THEN 1
            ELSE 0
          END DESC,
          ST_Distance(hz.geom::geography, ${routeLine}::geography) ASC
        LIMIT 100;
      `;

      // 5. 转换为 HazardZoneState 格式
      return results.map((row) => ({
        zoneId: row.zone_id,
        type: row.type as HazardZoneState['type'],
        level: row.level as HazardZoneState['level'],
        seasonality: row.seasonality
          ? {
              highRiskMonths: (row.seasonality as any).highRiskMonths || [],
              lowRiskMonths: (row.seasonality as any).lowRiskMonths || [],
            }
          : undefined,
        geom: row.geom,
        metadata: row.metadata || {},
      }));
    } catch (error: any) {
      // 如果表不存在或其他错误，记录警告并返回空数组
      if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.message?.includes('table')) {
        this.logger.warn('hazard_zones 表不存在，返回空结果。请运行数据库迁移创建表。');
        return [];
      }
      this.logger.error(`查询危险区域失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
