// src/trips/readiness/services/dem-elevation.service.ts

/**
 * DEM 海拔查询服务
 * 
 * 从 PostGIS 栅格数据中查询指定坐标点的海拔信息
 * 
 * 查询策略：
 * 1. 优先使用合并的城市 DEM 表（geo_dem_cities_merged）- 包含所有城市数据，性能最佳
 * 2. 区域 DEM 表（如 geo_dem_xizang）- 作为后备
 * 3. 全球 DEM 表（geo_dem_global）- 最终后备（覆盖全球）
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
   * 
   * @deprecated 此方法已不再在主要查询路径中使用，因为已改用合并表 geo_dem_cities_merged
   * 保留此方法仅用于调试或特殊情况
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
   * 检查坐标是否在冰岛范围内
   * 冰岛大致范围：纬度 63.3°N - 66.5°N，经度 -24.5°W - -13.5°W
   */
  private isInIcelandBounds(lat: number, lng: number): boolean {
    return lat >= 63.3 && lat <= 66.5 && lng >= -24.5 && lng <= -13.5;
  }

  /**
   * 从 DEM 数据获取坐标点的海拔
   * 
   * 查询优先级：
   * 1. 冰岛专用高精度 DEM 表（geo_dem_iceland_20m）- 如果坐标在冰岛范围内，最优先使用20m精度数据
   * 2. 合并的城市 DEM 表（geo_dem_cities_merged）- 包含所有城市数据，性能最佳
   * 3. 区域 DEM 表（如 geo_dem_xizang）- 作为后备
   * 4. 全球 DEM 表（geo_dem_global）- 最终后备（覆盖全球）
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
    // 1. 如果坐标在冰岛范围内，优先查询冰岛专用高精度DEM表（20m精度）
    if (this.isInIcelandBounds(lat, lng)) {
      try {
        const icelandTableExists = await this.checkDEMTableExists('geo_dem_iceland_20m');
        if (icelandTableExists) {
          const elevation = await this.queryElevationFromTable(lat, lng, 'geo_dem_iceland_20m', 5327);
          if (elevation !== null) {
            this.logger.debug(`从冰岛20m DEM表获取海拔: ${elevation}m`);
            return elevation;
          }
        }
      } catch (error) {
        this.logger.debug(`冰岛DEM表查询失败，尝试其他表`);
      }
    }

    // 2. 优先查询合并的城市 DEM 表（性能最佳）
    try {
      const mergedTableExists = await this.checkDEMTableExists('geo_dem_cities_merged');
      if (mergedTableExists) {
        const elevation = await this.queryElevationFromTable(lat, lng, 'geo_dem_cities_merged');
        if (elevation !== null) {
          this.logger.debug(`从合并城市DEM表获取海拔: ${elevation}m`);
          return elevation;
        }
      }
    } catch (error) {
      this.logger.debug(`合并城市DEM表查询失败，尝试后备表`);
    }

    // 3. 如果合并表查询失败，使用区域后备表
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

    // 4. 最终后备：全球 DEM 表（如果存在）
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
   * 
   * @param lat 纬度
   * @param lng 经度
   * @param demTable DEM表名
   * @param rasterSrid 栅格数据的SRID（默认4326，如果是ISN2016则使用5327）
   */
  private async queryElevationFromTable(
    lat: number,
    lng: number,
    demTable: string,
    rasterSrid: number = 4326
  ): Promise<number | null> {
    try {
      let query: string;
      
      // 如果栅格使用ISN2016坐标系，需要转换坐标
      if (rasterSrid === 5327) {
        query = `
          SELECT ST_Value(
            rast, 
            ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 5327)
          )::INTEGER as elevation
          FROM ${demTable}
          WHERE ST_Intersects(
            rast, 
            ST_Transform(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), 5327)
          )
          LIMIT 1;
        `;
      } else {
        query = `
          SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))::INTEGER as elevation
          FROM ${demTable}
          WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
          LIMIT 1;
        `;
      }

      const result = await (this.prisma as any).$queryRawUnsafe(query) as Array<{ elevation: number | null }>;

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

    // 使用批量查询优化（PostGIS空间函数）
    // 如果点数较少，直接批量查询；如果点数很多，分批查询
    const batchSize = 100;
    if (points.length <= batchSize) {
      return this.batchQueryElevations(points, fallbackTable);
    }

    // 分批查询
    const results: Array<number | null> = [];
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      const batchResults = await this.batchQueryElevations(batch, fallbackTable);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 批量查询海拔（使用PostGIS空间函数优化）
   */
  private async batchQueryElevations(
    points: Array<{ lat: number; lng: number }>,
    fallbackTable: string = 'geo_dem_xizang'
  ): Promise<Array<number | null>> {
    if (points.length === 0) {
      return [];
    }

    // 检查是否有冰岛坐标
    const hasIcelandPoints = points.some(p => this.isInIcelandBounds(p.lat, p.lng));
    
    // 1. 如果坐标在冰岛范围内，优先查询冰岛专用高精度DEM表
    if (hasIcelandPoints) {
      try {
        const icelandTableExists = await this.checkDEMTableExists('geo_dem_iceland_20m');
        if (icelandTableExists) {
          const results = await this.batchQueryFromTable(points, 'geo_dem_iceland_20m', 5327);
          if (results.every(r => r !== null)) {
            return results;
          }
        }
      } catch (error) {
        this.logger.debug(`冰岛DEM表批量查询失败，尝试其他表`);
      }
    }

    // 2. 查询合并的城市DEM表
    try {
      const mergedTableExists = await this.checkDEMTableExists('geo_dem_cities_merged');
      if (mergedTableExists) {
        const results = await this.batchQueryFromTable(points, 'geo_dem_cities_merged');
        if (results.every(r => r !== null)) {
          return results;
        }
      }
    } catch (error) {
      this.logger.debug(`合并城市DEM表批量查询失败，尝试后备表`);
    }

    // 3. 查询区域后备表
    try {
      const results = await this.batchQueryFromTable(points, fallbackTable);
      if (results.every(r => r !== null)) {
        return results;
      }
    } catch (error) {
      this.logger.debug(`区域DEM表批量查询失败，尝试全球表`);
    }

    // 4. 查询全球DEM表
    try {
      const globalTableExists = await this.checkDEMTableExists('geo_dem_global');
      if (globalTableExists) {
        return await this.batchQueryFromTable(points, 'geo_dem_global');
      }
    } catch (error) {
      this.logger.debug(`全球DEM表批量查询失败`);
    }

    return new Array(points.length).fill(null);
  }

  /**
   * 从指定DEM表批量查询海拔
   */
  private async batchQueryFromTable(
    points: Array<{ lat: number; lng: number }>,
    demTable: string,
    srid: number = 4326
  ): Promise<Array<number | null>> {
    try {
      const lngs = points.map(p => p.lng);
      const lats = points.map(p => p.lat);

      const query = `
        WITH points AS (
          SELECT 
            row_number() OVER () as idx,
            ST_SetSRID(ST_MakePoint(lng, lat), ${srid}) as geom
          FROM unnest($1::float[], $2::float[]) AS t(lng, lat)
        )
        SELECT 
          p.idx,
          ST_Value(r.rast, p.geom)::INTEGER as elevation
        FROM points p
        CROSS JOIN LATERAL (
          SELECT rast
          FROM ${demTable}
          WHERE ST_Intersects(rast, p.geom)
          LIMIT 1
        ) r
        ORDER BY p.idx;
      `;

      const result = await (this.prisma as any).$queryRawUnsafe(
        query,
        lngs,
        lats
      ) as Array<{ idx: number; elevation: number | null }>;

      const elevationMap = new Map<number, number | null>();
      for (const row of result) {
        elevationMap.set(row.idx, row.elevation !== null ? Math.round(row.elevation) : null);
      }

      return points.map((_, idx) => elevationMap.get(idx + 1) ?? null);
    } catch (error: any) {
      this.logger.warn(`批量查询DEM失败 (表: ${demTable}): ${error.message}`);
      return new Array(points.length).fill(null);
    }
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

