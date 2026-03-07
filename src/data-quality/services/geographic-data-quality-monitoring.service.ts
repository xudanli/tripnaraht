// src/data-quality/services/geographic-data-quality-monitoring.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DataQualityAlertService } from './data-quality-alert.service';
import { DEMResolutionCacheService } from './dem-resolution-cache.service';

/**
 * 地理数据质量监控服务
 * 
 * 功能：
 * - 监控DEM数据质量（空间精度、查询性能、覆盖情况）
 * - 监控地理特征数据质量（空间完整性、查询性能、覆盖情况）
 * - 监控PostGIS查询性能（P50、P95、P99延迟）
 * - 检测地理数据质量问题并触发告警
 */
@Injectable()
export class GeographicDataQualityMonitoringService {
  private readonly logger = new Logger(GeographicDataQualityMonitoringService.name);

  // 测试坐标点（用于性能监控）
  private readonly testCoordinates: Record<string, Array<{ lat: number; lng: number; name: string }>> = {
    CH: [
      { lat: 46.5197, lng: 6.6323, name: '日内瓦' },
      { lat: 47.3769, lng: 8.5417, name: '苏黎世' },
    ],
    NO: [
      { lat: 59.9139, lng: 10.7522, name: '奥斯陆' },
      { lat: 60.3913, lng: 5.3221, name: '卑尔根' },
    ],
    PE: [
      { lat: -12.0464, lng: -77.0428, name: '利马' },
      { lat: -13.1631, lng: -72.5450, name: '库斯科' },
    ],
    IS: [
      { lat: 64.1265, lng: -21.8174, name: '雷克雅未克' },
    ],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertService: DataQualityAlertService,
    private readonly resolutionCache: DEMResolutionCacheService,
  ) {}

  /** 检测是否为 Prisma 断开连接错误（应用关闭时常见） */
  private isPrismaDisconnectionError(error: any): boolean {
    const msg = String(error?.message ?? '');
    return (
      msg.includes('Engine is not yet connected') ||
      msg.includes('Response from the Engine was empty')
    );
  }

  /**
   * 定时任务：每30分钟执行一次地理数据质量监控
   * 当 SKIP_GEO_MONITORING=1 时跳过（用于测试/脚本环境）
   */
  @Cron('*/30 * * * *') // 每30分钟
  async runGeographicMonitoringTask() {
    if (process.env.SKIP_GEO_MONITORING === '1') {
      return;
    }
    this.logger.log('开始执行地理数据质量监控任务...');

    try {
      // 监控DEM数据
      await this.monitorDEMData();

      // 监控地理特征数据
      await this.monitorGeographicFeatures();

      this.logger.log('地理数据质量监控任务完成');
    } catch (error: any) {
      this.logger.error(`地理数据质量监控任务失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 监控DEM数据质量
   */
  private async monitorDEMData(): Promise<void> {
    const countries = ['CH', 'NO', 'PE', 'IS'];

    for (const countryCode of countries) {
      try {
        // 1. 评估空间精度
        const spatialAccuracy = await this.assessDEMSpatialAccuracy(countryCode);

        // 2. 评估坐标系统一致性
        const coordinateSystemConsistency = await this.assessDEMCoordinateSystemConsistency(countryCode);

        // 3. 评估空间完整性（覆盖率）
        const spatialCompleteness = await this.assessDEMSpatialCompleteness(countryCode);

        // 4. 监控查询性能
        const queryPerformance = await this.monitorDEMQueryPerformance(countryCode);

        // 5. 更新监控记录
        await this.upsertGeographicMonitor({
          dataSource: `${countryCode.toLowerCase()}-dem`,
          dataType: 'DEM',
          countryCode,
          spatialAccuracy,
          coordinateSystemConsistency,
          spatialCompleteness,
          spatialConsistency: 1.0, // DEM数据通常一致性较好
          queryLatencyP50: queryPerformance.p50,
          queryLatencyP95: queryPerformance.p95,
          queryLatencyP99: queryPerformance.p99,
          querySuccessRate: queryPerformance.successRate,
          coverageRate: spatialCompleteness,
        });

        // 6. 检查告警规则
        await this.checkGeographicAlertRules({
          dataSource: `${countryCode.toLowerCase()}-dem`,
          dataType: 'DEM',
          countryCode,
          coverageRate: spatialCompleteness,
          queryLatencyP95: queryPerformance.p95,
          querySuccessRate: queryPerformance.successRate,
        });
      } catch (error: any) {
        if (this.isPrismaDisconnectionError(error)) {
          this.logger.debug(`监控DEM数据跳过 (${countryCode}): 数据库已断开`);
          return;
        }
        this.logger.error(`监控DEM数据失败 (${countryCode}): ${error.message}`);
      }
    }
  }

  /**
   * 监控地理特征数据质量
   */
  private async monitorGeographicFeatures(): Promise<void> {
    const countries = ['CH', 'NO', 'PE', 'IS'];
    const featureTypes = ['RIVERS', 'MOUNTAINS', 'ROADS', 'COASTLINES', 'PORTS', 'RAILWAYS'];

    for (const countryCode of countries) {
      for (const featureType of featureTypes) {
        try {
          // 1. 评估空间完整性（覆盖率）
          const spatialCompleteness = await this.assessFeatureSpatialCompleteness(
            countryCode,
            featureType
          );

          // 2. 评估坐标系统一致性
          const coordinateSystemConsistency = await this.assessFeatureCoordinateSystemConsistency(
            countryCode,
            featureType
          );

          // 3. 监控查询性能
          const queryPerformance = await this.monitorFeatureQueryPerformance(
            countryCode,
            featureType
          );

          // 4. 更新监控记录
          await this.upsertGeographicMonitor({
            dataSource: `${countryCode.toLowerCase()}-${featureType.toLowerCase()}`,
            dataType: featureType,
            countryCode,
            spatialAccuracy: 1.0, // 简化版：假设精度为1.0
            coordinateSystemConsistency,
            spatialCompleteness,
            spatialConsistency: 1.0, // 简化版：假设一致性为1.0
            queryLatencyP50: queryPerformance.p50,
            queryLatencyP95: queryPerformance.p95,
            queryLatencyP99: queryPerformance.p99,
            querySuccessRate: queryPerformance.successRate,
            coverageRate: spatialCompleteness,
          });

          // 5. 检查告警规则
          await this.checkGeographicAlertRules({
            dataSource: `${countryCode.toLowerCase()}-${featureType.toLowerCase()}`,
            dataType: featureType,
            countryCode,
            coverageRate: spatialCompleteness,
            queryLatencyP95: queryPerformance.p95,
            querySuccessRate: queryPerformance.successRate,
          });
        } catch (error: any) {
          if (this.isPrismaDisconnectionError(error)) {
            this.logger.debug(
              `监控地理特征数据跳过 (${countryCode}, ${featureType}): 数据库已断开`
            );
            return;
          }
          this.logger.error(
            `监控地理特征数据失败 (${countryCode}, ${featureType}): ${error.message}`
          );
        }
      }
    }
  }

  /**
   * 评估DEM空间精度
   */
  private async assessDEMSpatialAccuracy(countryCode: string): Promise<number> {
    try {
      // 尝试从DEM表获取分辨率信息
      const resolution = await this.getDEMResolution();
      
      // 根据分辨率评估精度（简化版）
      // 30m分辨率 -> 1.0, 90m -> 0.9, 300m -> 0.7, unknown -> 0.5
      if (resolution === '30m') return 1.0;
      if (resolution === '90m') return 0.9;
      if (resolution === '300m') return 0.7;
      if (resolution === 'unknown') return 0.5;
      
      return 0.8; // 默认值
    } catch (error) {
      return 0.5; // 无法评估时返回较低分数
    }
  }

  /**
   * 评估DEM坐标系统一致性
   */
  private async assessDEMCoordinateSystemConsistency(countryCode: string): Promise<number> {
    // DEM数据通常使用WGS84，假设一致性为1.0
    // 实际应该检查SRID是否一致
    return 1.0;
  }

  /**
   * 评估DEM空间完整性（覆盖率）
   */
  private async assessDEMSpatialCompleteness(countryCode: string): Promise<number> {
    const testCoords = this.testCoordinates[countryCode] || [];
    if (testCoords.length === 0) return 0;

    let successCount = 0;
    for (const coord of testCoords) {
      try {
        const elevation = await this.queryDEMElevation(coord.lat, coord.lng);
        if (elevation !== null) {
          successCount++;
        }
      } catch (error) {
        // 查询失败
      }
    }

    return successCount / testCoords.length;
  }

  /**
   * 监控DEM查询性能
   */
  private async monitorDEMQueryPerformance(countryCode: string): Promise<{
    p50: number;
    p95: number;
    p99: number;
    successRate: number;
  }> {
    const testCoords = this.testCoordinates[countryCode] || [];
    const latencies: number[] = [];
    let successCount = 0;

    // 执行多次查询以获取性能统计
    for (let i = 0; i < Math.min(testCoords.length * 10, 50); i++) {
      const coord = testCoords[i % testCoords.length];
      const start = Date.now();
      
      try {
        const elevation = await this.queryDEMElevation(coord.lat, coord.lng);
        const latency = Date.now() - start;
        
        if (elevation !== null) {
          successCount++;
          latencies.push(latency);
        }
      } catch (error) {
        // 查询失败
      }
    }

    // 计算延迟统计
    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
    const successRate = testCoords.length > 0 ? successCount / (testCoords.length * 10) : 0;

    return { p50, p95, p99, successRate };
  }

  /**
   * 评估地理特征空间完整性（覆盖率）
   */
  private async assessFeatureSpatialCompleteness(
    countryCode: string,
    featureType: string
  ): Promise<number> {
    const tableName = this.getFeatureTableName(featureType);
    if (!tableName) return 0;

    try {
      const bounds = this.getCountryBounds(countryCode);
      if (!bounds) return 0;

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
      // 简化版：如果有数据则认为覆盖率100%
      return featureCount > 0 ? 1.0 : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 评估地理特征坐标系统一致性
   */
  private async assessFeatureCoordinateSystemConsistency(
    countryCode: string,
    featureType: string
  ): Promise<number> {
    // 假设地理特征数据使用WGS84，一致性为1.0
    return 1.0;
  }

  /**
   * 监控地理特征查询性能
   */
  private async monitorFeatureQueryPerformance(
    countryCode: string,
    featureType: string
  ): Promise<{
    p50: number;
    p95: number;
    p99: number;
    successRate: number;
  }> {
    const testCoords = this.testCoordinates[countryCode] || [];
    const latencies: number[] = [];
    let successCount = 0;

    const tableName = this.getFeatureTableName(featureType);
    if (!tableName) {
      return { p50: 0, p95: 0, p99: 0, successRate: 0 };
    }

    for (const coord of testCoords) {
      const start = Date.now();
      try {
        const result: any = await this.prisma.$queryRawUnsafe(`
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography,
            5000
          );
        `);

        const latency = Date.now() - start;
        if (result?.[0]?.count !== undefined) {
          successCount++;
          latencies.push(latency);
        }
      } catch (error) {
        // 查询失败
      }
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;
    const successRate = testCoords.length > 0 ? successCount / testCoords.length : 0;

    return { p50, p95, p99, successRate };
  }

  /**
   * 检查地理数据告警规则
   */
  private async checkGeographicAlertRules(config: {
    dataSource: string;
    dataType: string;
    countryCode: string;
    coverageRate: number;
    queryLatencyP95: number;
    querySuccessRate: number;
  }): Promise<void> {
    const monitor = await this.prisma.geographicDataQualityMonitor.findUnique({
      where: {
        dataSource_dataType: {
          dataSource: config.dataSource,
          dataType: config.dataType,
        },
      },
    });

    if (!monitor) return;

    // CRITICAL: DEM数据缺失（核心国家）
    if (
      config.dataType === 'DEM' &&
      config.coverageRate < 0.8 &&
      ['CH', 'NO', 'PE'].includes(config.countryCode)
    ) {
      await this.alertService.createAlert({
        geographicMonitorId: monitor.id,
        severity: 'CRITICAL',
        alertType: 'DEM_DATA_MISSING',
        message: `DEM数据缺失: ${config.countryCode}，覆盖率: ${(config.coverageRate * 100).toFixed(1)}%`,
        details: { countryCode: config.countryCode, coverageRate: config.coverageRate },
      });
    }

    // HIGH: 空间查询P95延迟 > 500ms
    if (config.queryLatencyP95 > 500) {
      await this.alertService.createAlert({
        geographicMonitorId: monitor.id,
        severity: 'HIGH',
        alertType: 'SPATIAL_QUERY_LATENCY_HIGH',
        message: `空间查询性能较差: P95延迟 ${config.queryLatencyP95}ms`,
        details: { queryLatencyP95: config.queryLatencyP95 },
      });
    }

    // HIGH: 查询成功率 < 95%
    if (config.querySuccessRate < 0.95) {
      await this.alertService.createAlert({
        geographicMonitorId: monitor.id,
        severity: 'HIGH',
        alertType: 'SPATIAL_QUERY_FAILURE_RATE_HIGH',
        message: `空间查询失败率较高: ${((1 - config.querySuccessRate) * 100).toFixed(1)}%`,
        details: { querySuccessRate: config.querySuccessRate },
      });
    }

    // MEDIUM: 地理特征数据覆盖率 < 90%
    // 注意：冰岛(IS)等岛国需要海岸线数据，应该包含在监控范围内
    if (
      config.dataType !== 'DEM' &&
      config.coverageRate < 0.9 &&
      (['CH', 'NO', 'PE'].includes(config.countryCode) || 
       (config.dataType === 'COASTLINES' && ['IS', 'GL', 'FO', 'NZ'].includes(config.countryCode)))
    ) {
      await this.alertService.createAlert({
        geographicMonitorId: monitor.id,
        severity: 'MEDIUM',
        alertType: 'GEOGRAPHIC_FEATURES_COVERAGE_LOW',
        message: `地理特征数据覆盖率不足: ${config.dataType} - ${(config.coverageRate * 100).toFixed(1)}%`,
        details: { dataType: config.dataType, coverageRate: config.coverageRate },
      });
    }
  }

  /**
   * 更新或创建地理数据监控记录
   */
  private async upsertGeographicMonitor(data: {
    dataSource: string;
    dataType: string;
    countryCode: string;
    spatialAccuracy: number;
    coordinateSystemConsistency: number;
    spatialCompleteness: number;
    spatialConsistency: number;
    queryLatencyP50?: number;
    queryLatencyP95?: number;
    queryLatencyP99?: number;
    querySuccessRate?: number;
    coverageRate?: number;
  }): Promise<void> {
    // 计算标准质量维度（简化版）
    const completeness = data.spatialCompleteness;
    const accuracy = data.spatialAccuracy;
    const consistency = data.spatialConsistency;
    const timeliness = 1.0; // 地理数据通常不随时间变化
    const traceability = 1.0; // 假设可追溯性为1.0

    // 计算总体分数
    const overallScore =
      completeness * 0.3 +
      accuracy * 0.3 +
      consistency * 0.2 +
      timeliness * 0.15 +
      traceability * 0.05;

    // 确定状态
    let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (overallScore < 0.6 || (data.coverageRate !== undefined && data.coverageRate < 0.8)) {
      status = 'CRITICAL';
    } else if (overallScore < 0.8 || (data.coverageRate !== undefined && data.coverageRate < 0.9)) {
      status = 'WARNING';
    }

    await this.prisma.geographicDataQualityMonitor.upsert({
      where: {
        dataSource_dataType: {
          dataSource: data.dataSource,
          dataType: data.dataType,
        },
      },
      create: {
        dataSource: data.dataSource,
        dataType: data.dataType,
        countryCode: data.countryCode,
        spatialAccuracy: data.spatialAccuracy,
        coordinateSystemConsistency: data.coordinateSystemConsistency,
        spatialCompleteness: data.spatialCompleteness,
        spatialConsistency: data.spatialConsistency,
        completeness,
        accuracy,
        consistency,
        timeliness,
        traceability,
        overallScore,
        queryLatencyP50: data.queryLatencyP50,
        queryLatencyP95: data.queryLatencyP95,
        queryLatencyP99: data.queryLatencyP99,
        querySuccessRate: data.querySuccessRate,
        coverageRate: data.coverageRate,
        lastUpdated: new Date(),
        lastVerified: new Date(),
        recordCount: 0,
        status,
      },
      update: {
        spatialAccuracy: data.spatialAccuracy,
        coordinateSystemConsistency: data.coordinateSystemConsistency,
        spatialCompleteness: data.spatialCompleteness,
        spatialConsistency: data.spatialConsistency,
        completeness,
        accuracy,
        consistency,
        timeliness,
        traceability,
        overallScore,
        queryLatencyP50: data.queryLatencyP50,
        queryLatencyP95: data.queryLatencyP95,
        queryLatencyP99: data.queryLatencyP99,
        querySuccessRate: data.querySuccessRate,
        coverageRate: data.coverageRate,
        lastUpdated: new Date(),
        lastVerified: new Date(),
        status,
      },
    });
  }

  // ========== 辅助方法 ==========

  /**
   * 查询DEM海拔
   */
  private async queryDEMElevation(lat: number, lng: number): Promise<number | null> {
    try {
      const result: any = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_cities_merged
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);

      if (result?.[0]?.elevation !== null && result?.[0]?.elevation !== undefined) {
        return parseFloat(result[0].elevation);
      }

      // 后备：查询全局DEM表
      const globalResult: any = await this.prisma.$queryRawUnsafe(`
        SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) as elevation
        FROM geo_dem_global
        WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
        LIMIT 1;
      `);

      if (globalResult?.[0]?.elevation !== null && globalResult?.[0]?.elevation !== undefined) {
        return parseFloat(globalResult[0].elevation);
      }

      return null;
    } catch (error) {
      return null;
    }
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
   * 获取地理特征表名
   */
  private getFeatureTableName(featureType: string): string | null {
    const tableMap: Record<string, string> = {
      RIVERS: 'geo_rivers_line',
      MOUNTAINS: 'geo_mountains_standard',
      ROADS: 'geo_roads',
      COASTLINES: 'geo_coastlines',
      PORTS: 'geo_ports',
      RAILWAYS: 'geo_railways',
    };

    return tableMap[featureType] || null;
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
