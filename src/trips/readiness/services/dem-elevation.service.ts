// src/trips/readiness/services/dem-elevation.service.ts

/**
 * DEM 海拔查询服务
 * 
 * 从 PostGIS 栅格数据中查询指定坐标点的海拔信息
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DEMElevationService {
  private readonly logger = new Logger(DEMElevationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查找可能包含坐标的城市 DEM 表
   * 通过检查表的边界范围来判断
   */
  private async findCityDEMTables(lat: number, lng: number): Promise<string[]> {
    try {
      // 获取所有城市 DEM 表
      const tables = await (this.prisma as any).$queryRawUnsafe(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name LIKE 'geo_dem_city_%'
        ORDER BY table_name;
      `) as Array<{ table_name: string }>;

      const matchingTables: string[] = [];

      // 检查每个表是否包含该坐标
      for (const table of tables) {
        try {
          const bounds = await this.getDEMBounds(table.table_name);
          if (bounds && 
              lat >= bounds.minLat && lat <= bounds.maxLat &&
              lng >= bounds.minLng && lng <= bounds.maxLng) {
            matchingTables.push(table.table_name);
          }
        } catch (error) {
          // 忽略单个表的错误，继续检查其他表
        }
      }

      return matchingTables;
    } catch (error) {
      this.logger.debug(`查找城市 DEM 表失败:`, error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * 从 DEM 数据获取坐标点的海拔
   * 
   * 查询优先级：
   * 1. 城市 DEM 表（最精确）- 自动查找包含该坐标的城市表
   * 2. 区域 DEM 表（如 geo_dem_xizang）- 作为后备
   * 3. 全球 DEM 表（geo_dem_global）- 最终后备（覆盖全球）
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param fallbackTable 后备 DEM 表名（默认: geo_dem_xizang）
   * @returns 海拔（米），如果查询失败返回 null
   */
  async getElevation(
    lat: number,
    lng: number,
    fallbackTable: string = 'geo_dem_xizang'
  ): Promise<number | null> {
    // 1. 优先查询城市 DEM 表
    const cityTables = await this.findCityDEMTables(lat, lng);
    
    for (const cityTable of cityTables) {
      try {
        const elevation = await this.queryElevationFromTable(lat, lng, cityTable);
        if (elevation !== null) {
          this.logger.debug(`从城市表 ${cityTable} 获取海拔: ${elevation}m`);
          return elevation;
        }
      } catch (error) {
        // 继续尝试下一个表
        this.logger.debug(`城市表 ${cityTable} 查询失败，尝试下一个`);
      }
    }

    // 2. 如果城市表查询失败，使用区域后备表
    if (fallbackTable) {
      try {
        const elevation = await this.queryElevationFromTable(lat, lng, fallbackTable);
        if (elevation !== null) {
          this.logger.debug(`从区域后备表 ${fallbackTable} 获取海拔: ${elevation}m`);
          return elevation;
        }
      } catch (error) {
        this.logger.debug(`区域后备表 ${fallbackTable} 查询失败`);
      }
    }

    // 3. 最终后备：全球 DEM 表（如果存在）
    try {
      const globalTableExists = await this.checkDEMTableExists('geo_dem_global');
      if (globalTableExists) {
        const elevation = await this.queryElevationFromTable(lat, lng, 'geo_dem_global');
        if (elevation !== null) {
          this.logger.debug(`从全球DEM表获取海拔: ${elevation}m`);
          return elevation;
        }
      }
    } catch (error) {
      this.logger.debug(`全球DEM表查询失败`);
    }

    return null;
  }

  /**
   * 从指定表查询海拔
   */
  private async queryElevationFromTable(
    lat: number,
    lng: number,
    demTable: string
  ): Promise<number | null> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))::INTEGER as elevation
        FROM ${demTable}
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `) as Array<{ elevation: number | null }>;

      if (result.length === 0 || result[0].elevation === null) {
        return null;
      }

      return Math.round(result[0].elevation);
    } catch (error) {
      // 如果表不存在或查询失败，返回 null
      if (error instanceof Error && (
        error.message.includes('does not exist') ||
        error.message.includes('relation') ||
        error.message.includes('table')
      )) {
        return null;
      }
      throw error;
    }
  }

  /**
   * 批量获取多个坐标点的海拔
   * 
   * @param points 坐标点数组 [{lat, lng}, ...]
   * @param fallbackTable 后备 DEM 表名（默认: geo_dem_xizang）
   * @returns 海拔数组，与输入数组对应
   */
  async getElevations(
    points: Array<{ lat: number; lng: number }>,
    fallbackTable: string = 'geo_dem_xizang'
  ): Promise<Array<number | null>> {
    if (points.length === 0) {
      return [];
    }

    // 对于批量查询，逐个查询（PostGIS 栅格查询较慢，批量优化需要更复杂的实现）
    // 每个点会自动按优先级查询：城市DEM -> 区域DEM -> 全球DEM
    const results = await Promise.all(
      points.map(point => this.getElevation(point.lat, point.lng, fallbackTable))
    );

    return results;
  }

  /**
   * 检查 DEM 表是否存在
   */
  async checkDEMTableExists(demTable: string = 'geo_dem_xizang'): Promise<boolean> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = '${demTable}'
        );
      `) as Array<{ exists: boolean }>;
      return result[0]?.exists || false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 DEM 表的覆盖范围
   */
  async getDEMBounds(demTable: string = 'geo_dem_xizang'): Promise<{
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT 
          ST_YMin(ST_Envelope(ST_Union(rast))) as min_lat,
          ST_YMax(ST_Envelope(ST_Union(rast))) as max_lat,
          ST_XMin(ST_Envelope(ST_Union(rast))) as min_lng,
          ST_XMax(ST_Envelope(ST_Union(rast))) as max_lng
        FROM ${demTable};
      `) as Array<{
        min_lat: number;
        max_lat: number;
        min_lng: number;
        max_lng: number;
      }>;

      if (result.length === 0 || !result[0].min_lat) {
        return null;
      }

      return {
        minLat: result[0].min_lat,
        maxLat: result[0].max_lat,
        minLng: result[0].min_lng,
        maxLng: result[0].max_lng,
      };
    } catch (error) {
      this.logger.warn(`获取 DEM 边界失败:`, error instanceof Error ? error.message : error);
      return null;
    }
  }
}

