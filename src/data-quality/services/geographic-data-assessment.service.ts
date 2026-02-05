// src/data-quality/services/geographic-data-assessment.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEMResolutionCacheService } from './dem-resolution-cache.service';

/**
 * DEM覆盖评估结果
 */
export interface DEMCoverageAssessment {
  coverageRate: number; // 0-1
  resolution: string; // '30m' | '90m' | '300m' | 'unknown'
  querySuccessRate: number; // 0-1
  queryLatency: {
    p50: number;
    p95: number;
    p99: number;
  };
  missingRegions: Array<{ region: string; reason: string }>;
}

/**
 * 地理特征覆盖评估结果
 */
export interface GeographicFeaturesCoverageAssessment {
  rivers: { coverageRate: number; featureCount: number; missingRegions: string[] };
  mountains: { coverageRate: number; featureCount: number; missingRegions: string[] };
  roads: { coverageRate: number; featureCount: number; missingRegions: string[] };
  coastlines: { coverageRate: number; featureCount: number; missingRegions: string[] };
  ports: { coverageRate: number; featureCount: number; missingRegions: string[] };
  railways: { coverageRate: number; featureCount: number; missingRegions: string[] };
}

/**
 * 地理数据质量评估结果
 */
export interface GeographicDataAssessment {
  countryCode: string;
  demAssessment: DEMCoverageAssessment;
  geographicFeaturesAssessment: GeographicFeaturesCoverageAssessment;
  recommendations: Array<{
    issue: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendation: string;
    priority: 'P0' | 'P1' | 'P2';
  }>;
}

/**
 * 地理数据评估服务
 * 
 * 功能：
 * - 评估指定国家的DEM数据覆盖情况
 * - 评估指定国家的地理特征数据覆盖情况
 * - 生成地理数据质量报告
 */
@Injectable()
export class GeographicDataAssessmentService {
  private readonly logger = new Logger(GeographicDataAssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolutionCache: DEMResolutionCacheService,
  ) {}

  // 测试坐标点
  private readonly testCoordinates: Record<string, Array<{ lat: number; lng: number; name: string }>> = {
    CH: [
      { lat: 46.5197, lng: 6.6323, name: '日内瓦' },
      { lat: 47.3769, lng: 8.5417, name: '苏黎世' },
      { lat: 46.2044, lng: 6.1432, name: '洛桑' },
      { lat: 46.9481, lng: 7.4474, name: '伯尔尼' },
      { lat: 46.2276, lng: 6.1058, name: '蒙特勒' },
    ],
    NO: [
      { lat: 59.9139, lng: 10.7522, name: '奥斯陆' },
      { lat: 60.3913, lng: 5.3221, name: '卑尔根' },
      { lat: 63.4305, lng: 10.3951, name: '特隆赫姆' },
      { lat: 69.6492, lng: 18.9553, name: '特罗姆瑟' },
      { lat: 58.1467, lng: 7.9956, name: '克里斯蒂安桑' },
    ],
    PE: [
      { lat: -12.0464, lng: -77.0428, name: '利马' },
      { lat: -13.1631, lng: -72.5450, name: '库斯科' },
      { lat: -16.4090, lng: -71.5375, name: '阿雷基帕' },
      { lat: -8.1116, lng: -79.0288, name: '特鲁希略' },
      { lat: -3.7491, lng: -73.2532, name: '伊基托斯' },
    ],
  };

  /**
   * 评估指定国家的地理数据质量
   */
  async assessCountryGeographicData(countryCode: string): Promise<GeographicDataAssessment> {
    this.logger.log(`评估 ${countryCode} 的地理数据质量...`);

    // 1. 评估DEM数据
    const demAssessment = await this.assessDEMCoverage(countryCode);

    // 2. 评估地理特征数据
    const geographicFeaturesAssessment = await this.assessGeographicFeaturesCoverage(countryCode);

    // 3. 生成建议
    const recommendations = this.generateRecommendations(
      countryCode,
      demAssessment,
      geographicFeaturesAssessment
    );

    return {
      countryCode,
      demAssessment,
      geographicFeaturesAssessment,
      recommendations,
    };
  }

  /**
   * 评估DEM数据覆盖情况
   */
  async assessDEMCoverage(countryCode: string): Promise<DEMCoverageAssessment> {
    // 1. 检查DEM表是否存在
    const citiesMergedExists = await this.checkDEMTableExists('geo_dem_cities_merged');
    const globalExists = await this.checkDEMTableExists('geo_dem_global');
    const hasDEMData = citiesMergedExists || globalExists;

    if (!hasDEMData) {
      return {
        coverageRate: 0,
        resolution: 'unknown',
        querySuccessRate: 0,
        queryLatency: { p50: 0, p95: 0, p99: 0 },
        missingRegions: [{
          region: countryCode,
          reason: 'DEM数据表不存在',
        }],
      };
    }

    // 2. 获取分辨率
    const resolution = await this.getDEMResolution();

    // 3. 测试DEM查询性能
    const testCoordinates = this.testCoordinates[countryCode] || [];
    let querySuccessCount = 0;
    const latencies: number[] = [];

    for (const coord of testCoordinates) {
      const { elevation, latency } = await this.queryDEMElevation(coord.lat, coord.lng);
      if (elevation !== null) {
        querySuccessCount++;
        latencies.push(latency);
      }
    }

    const querySuccessRate = testCoordinates.length > 0
      ? querySuccessCount / testCoordinates.length
      : 0;

    // 4. 计算查询延迟统计
    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;

    // 5. 计算覆盖率
    const coverageRate = querySuccessRate;

    // 6. 识别缺失区域
    const missingRegions: Array<{ region: string; reason: string }> = [];
    if (coverageRate < 0.9) {
      missingRegions.push({
        region: countryCode,
        reason: `DEM数据存在但覆盖率不足 (${(coverageRate * 100).toFixed(1)}%)`,
      });
    }

    return {
      coverageRate,
      resolution,
      querySuccessRate,
      queryLatency: { p50, p95, p99 },
      missingRegions,
    };
  }

  /**
   * 评估地理特征数据覆盖情况
   */
  async assessGeographicFeaturesCoverage(
    countryCode: string
  ): Promise<GeographicFeaturesCoverageAssessment> {
    const bounds = this.getCountryBounds(countryCode);
    if (!bounds) {
      throw new Error(`未知国家代码: ${countryCode}`);
    }

    // 评估各类型地理特征数据
    const rivers = await this.assessFeatureCoverage('geo_rivers_line', countryCode, bounds);
    const mountains = await this.assessFeatureCoverage('geo_mountains_standard', countryCode, bounds);
    const roads = await this.assessFeatureCoverage('geo_roads', countryCode, bounds);
    const coastlines = await this.assessFeatureCoverage('geo_coastlines', countryCode, bounds);
    const ports = await this.assessFeatureCoverage('geo_ports', countryCode, bounds);
    const railways = await this.assessFeatureCoverage('geo_railways', countryCode, bounds);

    return {
      rivers,
      mountains,
      roads,
      coastlines,
      ports,
      railways,
    };
  }

  /**
   * 评估单个地理特征类型
   */
  private async assessFeatureCoverage(
    tableName: string,
    countryCode: string,
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  ): Promise<{ coverageRate: number; featureCount: number; missingRegions: string[] }> {
    try {
      const tableExists = await this.checkTableExists(tableName);
      if (!tableExists) {
        return {
          coverageRate: 0,
          featureCount: 0,
          missingRegions: [countryCode],
        };
      }

      const countResult: any = await this.prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE ST_Intersects(
          geom,
          ST_MakeEnvelope(
            ${bounds.minLng}, ${bounds.minLat},
            ${bounds.maxLng}, ${bounds.maxLat},
            4326
          )
        );
      `);

      const featureCount = parseInt(countResult?.[0]?.count || '0');
      const coverageRate = featureCount > 0 ? 1.0 : 0;

      return {
        coverageRate,
        featureCount,
        missingRegions: coverageRate < 0.9 ? [countryCode] : [],
      };
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        return {
          coverageRate: 0,
          featureCount: 0,
          missingRegions: [countryCode],
        };
      }
      this.logger.warn(`评估表 ${tableName} 失败: ${error.message}`);
      return {
        coverageRate: 0,
        featureCount: 0,
        missingRegions: [countryCode],
      };
    }
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    countryCode: string,
    demAssessment: DEMCoverageAssessment,
    geographicFeaturesAssessment: GeographicFeaturesCoverageAssessment
  ): Array<{
    issue: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendation: string;
    priority: 'P0' | 'P1' | 'P2';
  }> {
    const recommendations: Array<{
      issue: string;
      impact: 'LOW' | 'MEDIUM' | 'HIGH';
      recommendation: string;
      priority: 'P0' | 'P1' | 'P2';
    }> = [];

    // DEM数据建议
    if (demAssessment.coverageRate < 0.9) {
      recommendations.push({
        issue: 'DEM数据覆盖率不足',
        impact: 'HIGH',
        recommendation: `需要补充 ${countryCode} 的DEM数据，当前覆盖率: ${(demAssessment.coverageRate * 100).toFixed(1)}%`,
        priority: 'P0',
      });
    }

    if (demAssessment.queryLatency.p95 > 500) {
      recommendations.push({
        issue: 'DEM查询性能较差',
        impact: 'MEDIUM',
        recommendation: `P95查询延迟 ${demAssessment.queryLatency.p95}ms，超过目标500ms，建议优化PostGIS查询或增加缓存`,
        priority: 'P1',
      });
    }

    // 地理特征数据建议
    if (geographicFeaturesAssessment.roads.coverageRate < 0.9) {
      recommendations.push({
        issue: '道路数据覆盖率不足',
        impact: 'HIGH',
        recommendation: `需要补充 ${countryCode} 的道路数据，当前覆盖率: ${(geographicFeaturesAssessment.roads.coverageRate * 100).toFixed(1)}%`,
        priority: 'P0',
      });
    }

    if (geographicFeaturesAssessment.rivers.coverageRate < 0.9) {
      recommendations.push({
        issue: '河流数据覆盖率不足',
        impact: 'MEDIUM',
        recommendation: `需要补充 ${countryCode} 的河流数据，当前覆盖率: ${(geographicFeaturesAssessment.rivers.coverageRate * 100).toFixed(1)}%`,
        priority: 'P1',
      });
    }

    if (geographicFeaturesAssessment.mountains.coverageRate < 0.9) {
      recommendations.push({
        issue: '山脉数据覆盖率不足',
        impact: 'MEDIUM',
        recommendation: `需要补充 ${countryCode} 的山脉数据，当前覆盖率: ${(geographicFeaturesAssessment.mountains.coverageRate * 100).toFixed(1)}%`,
        priority: 'P1',
      });
    }

    return recommendations;
  }

  /**
   * 生成地理数据质量报告
   */
  async generateQualityReport(countryCode: string): Promise<GeographicDataAssessment> {
    return this.assessCountryGeographicData(countryCode);
  }

  // ========== 辅助方法 ==========

  /**
   * 检查DEM表是否存在
   */
  private async checkDEMTableExists(tableName: string): Promise<boolean> {
    try {
      const result: any = await this.prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        ) as exists;
      `);
      return result?.[0]?.exists === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查表是否存在
   */
  private async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result: any = await this.prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        ) as exists;
      `);
      return result?.[0]?.exists === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 查询DEM海拔
   */
  private async queryDEMElevation(lat: number, lng: number): Promise<{ elevation: number | null; latency: number }> {
    const start = Date.now();
    let elevation: number | null = null;

    try {
      const result: any = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_cities_merged
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);

      if (result?.[0]?.elevation !== null && result?.[0]?.elevation !== undefined) {
        elevation = parseFloat(result[0].elevation);
      } else {
        const globalResult: any = await this.prisma.$queryRawUnsafe(`
          SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
          FROM geo_dem_global
          WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
          LIMIT 1;
        `);

        if (globalResult?.[0]?.elevation !== null && globalResult?.[0]?.elevation !== undefined) {
          elevation = parseFloat(globalResult[0].elevation);
        }
      }
    } catch (error: any) {
      if (!error.message?.includes('does not exist')) {
        this.logger.warn(`查询DEM失败 (${lat}, ${lng}): ${error.message}`);
      }
    }

    const latency = Date.now() - start;
    return { elevation, latency };
  }

  /**
   * 获取DEM分辨率（带缓存）
   * 从PostGIS raster元数据计算分辨率（ST_ScaleX/ST_ScaleY）
   */
  private async getDEMResolution(): Promise<string> {
    // 优先从 geo_dem_cities_merged 表获取（带缓存）
    const citiesResolution = await this.resolutionCache.getResolution(
      'geo_dem_cities_merged',
      async () => {
        try {
          const result: any = await this.prisma.$queryRawUnsafe(`
            SELECT 
              ST_ScaleX(rast) as scalex,
              ST_ScaleY(rast) as scaley,
              ST_UpperLeftY(rast) as lat
            FROM geo_dem_cities_merged 
            LIMIT 1;
          `);

          if (result?.[0]?.scalex) {
            const resolution = this.calculateResolutionFromScale(
              Math.abs(result[0].scalex),
              Math.abs(result[0].scaley),
              result[0].lat
            );
            if (resolution !== 'unknown') {
              return resolution;
            }
          }
        } catch (error) {
          // 忽略错误，继续尝试其他方法
        }

        // 如果无法从raster元数据获取，尝试从filename解析（向后兼容）
        try {
          const result: any = await this.prisma.$queryRawUnsafe(`
            SELECT filename FROM geo_dem_cities_merged LIMIT 1;
          `);

          if (result?.[0]?.filename) {
            const match = result[0].filename.match(/(\d+)m/i);
            if (match) {
              return `${match[1]}m`;
            }
          }
        } catch (error) {
          // 忽略错误
        }

        return 'unknown';
      }
    );

    if (citiesResolution !== 'unknown') {
      return citiesResolution;
    }

    // 如果cities表未找到，尝试从 geo_dem_global 表获取（带缓存）
    return await this.resolutionCache.getResolution(
      'geo_dem_global',
      async () => {
        try {
          const result: any = await this.prisma.$queryRawUnsafe(`
            SELECT 
              ST_ScaleX(rast) as scalex,
              ST_ScaleY(rast) as scaley,
              ST_UpperLeftY(rast) as lat
            FROM geo_dem_global 
            LIMIT 1;
          `);

          if (result?.[0]?.scalex) {
            const resolution = this.calculateResolutionFromScale(
              Math.abs(result[0].scalex),
              Math.abs(result[0].scaley),
              result[0].lat
            );
            if (resolution !== 'unknown') {
              return resolution;
            }
          }
        } catch (error) {
          // 忽略错误
        }

        return 'unknown';
      }
    );
  }

  /**
   * 从raster scale计算分辨率（米）
   * @param scaleX 经度方向的像素大小（度）
   * @param scaleY 纬度方向的像素大小（度）
   * @param lat 纬度（用于计算经度方向的米数）
   * @returns 分辨率字符串，如 '30m', '90m', '300m'
   */
  private calculateResolutionFromScale(
    scaleX: number,
    scaleY: number,
    lat?: number
  ): string {
    // WGS84坐标系：1度纬度 ≈ 111,000米（全球基本一致）
    // 1度经度 ≈ 111,000 * cos(纬度)米
    const metersPerDegreeLat = 111000;
    const metersPerDegreeLng = lat
      ? 111000 * Math.cos((lat * Math.PI) / 180)
      : 111000; // 如果没有纬度，使用平均值

    // 计算平均分辨率（米）
    const resolutionMeters = Math.sqrt(
      (scaleX * metersPerDegreeLng) ** 2 + (scaleY * metersPerDegreeLat) ** 2
    );

    // 四舍五入到常见的分辨率值
    const commonResolutions = [10, 30, 90, 300, 1000];
    let closestResolution = commonResolutions[0];
    let minDiff = Math.abs(resolutionMeters - closestResolution);

    for (const res of commonResolutions) {
      const diff = Math.abs(resolutionMeters - res);
      if (diff < minDiff) {
        minDiff = diff;
        closestResolution = res;
      }
    }

    // 如果差异太大（>50%），返回精确值
    if (minDiff / resolutionMeters > 0.5) {
      return `${Math.round(resolutionMeters)}m`;
    }

    return `${closestResolution}m`;
  }

  /**
   * 获取国家边界
   */
  private getCountryBounds(countryCode: string): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null {
    const bounds: Record<string, {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    }> = {
      CH: { minLat: 45.8, maxLat: 47.8, minLng: 5.9, maxLng: 10.5 },
      NO: { minLat: 57.9, maxLat: 71.2, minLng: 4.5, maxLng: 31.3 },
      PE: { minLat: -18.3, maxLat: -0.0, minLng: -81.3, maxLng: -68.7 },
      IS: { minLat: 63.3, maxLat: 66.6, minLng: -24.5, maxLng: -13.5 },
    };

    return bounds[countryCode] || null;
  }
}
