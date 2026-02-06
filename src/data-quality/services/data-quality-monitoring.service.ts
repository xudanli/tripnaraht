// src/data-quality/services/data-quality-monitoring.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DataQualityFrameworkService } from './data-quality-framework.service';
import { DataQualityAlertService } from './data-quality-alert.service';
import { PostgreSQLMcpService } from '../../mcp/postgresql-mcp.service';

/**
 * 数据源配置
 */
interface DataSourceConfig {
  dataSource: string;
  dataType: string;
  countryCode: string;
  freshnessThresholdHours: number; // 数据新鲜度阈值（小时）
  qualityThreshold: number; // 质量分数阈值（0-1）
}

/**
 * 数据质量监控服务
 * 
 * 功能：
 * - 定时监控所有数据源的质量
 * - 评估五维度质量（Completeness、Accuracy、Consistency、Timeliness、Traceability）
 * - 检测质量问题并触发告警
 * - 更新监控记录到数据库
 */
@Injectable()
export class DataQualityMonitoringService {
  private readonly logger = new Logger(DataQualityMonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataQualityFramework: DataQualityFrameworkService,
    private readonly alertService: DataQualityAlertService,
    @Optional() private readonly postgresqlMcp?: PostgreSQLMcpService,
  ) {}

  /**
   * 定时任务：每5分钟执行一次监控
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runMonitoringTask() {
    this.logger.log('开始执行数据质量监控任务...');
    
    try {
      await this.monitorAllSources();
      
      // 检查数据过期（每小时执行一次）
      const now = new Date();
      if (now.getMinutes() === 0) {
        await this.alertService.checkDataExpiry();
      }
      
      this.logger.log('数据质量监控任务完成');
    } catch (error: any) {
      this.logger.error(`数据质量监控任务失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 监控所有数据源
   */
  async monitorAllSources(): Promise<void> {
    // 获取所有需要监控的数据源配置
    const dataSources = await this.getDataSourceConfigs();

    // 并行监控所有数据源（最多10个并发）
    const batchSize = 10;
    for (let i = 0; i < dataSources.length; i += batchSize) {
      const batch = dataSources.slice(i, i + batchSize);
      await Promise.all(
        batch.map(config => this.monitorSource(config))
      );
    }
  }

  /**
   * 监控单个数据源
   */
  async monitorSource(config: DataSourceConfig): Promise<void> {
    try {
      this.logger.debug(`监控数据源: ${config.dataSource} (${config.dataType})`);

      // 1. 评估数据质量
      const assessment = await this.assessSourceQuality(config);

      // 2. 更新或创建监控记录
      await this.upsertMonitorRecord(config, assessment);

      // 3. 检查告警规则
      const alerts = await this.checkAlertRules(config, assessment);
      
      // 4. 创建告警（如果有）
      if (alerts.length > 0) {
        await Promise.all(
          alerts.map(alert => this.alertService.createAlert(alert))
        );
      }
    } catch (error: any) {
      this.logger.error(
        `监控数据源失败: ${config.dataSource} - ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * 评估数据源质量
   */
  async assessSourceQuality(
    config: DataSourceConfig
  ): Promise<{
    completeness: number;
    accuracy: number;
    consistency: number;
    timeliness: number;
    traceability: number;
    overallScore: number;
    recordCount: number;
    lastUpdated: Date;
  }> {
    // 1. 获取数据（从KnowledgeFile或Chunk表）
    const data = await this.fetchDataSourceData(config);

    // 2. 评估完整性
    const completeness = await this.assessCompleteness(config, data);

    // 3. 评估准确性
    const accuracy = await this.assessAccuracy(config, data);

    // 4. 评估一致性
    const consistency = await this.assessConsistency(config, data);

    // 5. 评估时效性
    const timeliness = await this.assessTimeliness(config, data);

    // 6. 评估可追溯性
    const traceability = await this.assessTraceability(config, data);

    // 7. 计算总体分数（加权平均）
    const overallScore = this.calculateOverallScore({
      completeness,
      accuracy,
      consistency,
      timeliness,
      traceability,
    });

    return {
      completeness,
      accuracy,
      consistency,
      timeliness,
      traceability,
      overallScore,
      recordCount: data.recordCount,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * 评估完整性
   */
  private async assessCompleteness(
    config: DataSourceConfig,
    data: any
  ): Promise<number> {
    // 根据数据类型定义必需字段
    const requiredFields = this.getRequiredFields(config.dataType);
    
    const metric = this.dataQualityFramework.assessCompleteness(
      data,
      requiredFields,
      []
    );

    return metric.currentValue;
  }

  /**
   * 评估准确性
   */
  private async assessAccuracy(
    config: DataSourceConfig,
    data: any
  ): Promise<number> {
    // 定义验证规则
    const validationRules = this.getValidationRules(config.dataType);

    const metric = this.dataQualityFramework.assessAccuracy(
      data,
      validationRules
    );

    return metric.currentValue;
  }

  /**
   * 评估一致性
   */
  private async assessConsistency(
    config: DataSourceConfig,
    data: any
  ): Promise<number> {
    const metric = this.dataQualityFramework.assessConsistency(data);

    return metric.currentValue;
  }

  /**
   * 使用 PostgreSQL MCP 检查数据完整性（复杂查询）
   * 
   * 使用场景：
   * - 检查跨表的数据完整性
   * - 检查外键约束
   * - 检查数据一致性
   */
  async checkDataIntegrity(): Promise<{
    issues: Array<{
      issueType: string;
      count: number;
      description: string;
    }>;
    overallHealth: number;
  }> {
    if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
      this.logger.warn('PostgreSQL MCP service not available, skipping data integrity check');
      return { issues: [], overallHealth: 1.0 };
    }

    try {
      // 检查行程没有关联天的情况
      const tripsWithoutDaysQuery = `
        SELECT 
          'trips_without_days' as issue_type,
          COUNT(*) as count
        FROM "Trip" t
        WHERE NOT EXISTS (
          SELECT 1 FROM "TripDay" td WHERE td.trip_id = t.id
        )
      `;

      // 检查天没有关联行程项的情况
      const daysWithoutItemsQuery = `
        SELECT 
          'days_without_items' as issue_type,
          COUNT(*) as count
        FROM "TripDay" td
        WHERE NOT EXISTS (
          SELECT 1 FROM "ItineraryItem" ii WHERE ii.trip_day_id = td.id
        )
      `;

      // 检查行程项没有关联地点的情况
      const itemsWithoutPlacesQuery = `
        SELECT 
          'items_without_places' as issue_type,
          COUNT(*) as count
        FROM "ItineraryItem" ii
        WHERE ii.place_id IS NULL
      `;

      // 检查孤立的地点（没有被任何行程项引用）
      const orphanedPlacesQuery = `
        SELECT 
          'orphaned_places' as issue_type,
          COUNT(*) as count
        FROM "Place" p
        WHERE NOT EXISTS (
          SELECT 1 FROM "ItineraryItem" ii WHERE ii.place_id = p.id
        )
      `;

      const [tripsWithoutDays, daysWithoutItems, itemsWithoutPlaces, orphanedPlaces] = await Promise.all([
        this.postgresqlMcp.query(tripsWithoutDaysQuery),
        this.postgresqlMcp.query(daysWithoutItemsQuery),
        this.postgresqlMcp.query(itemsWithoutPlacesQuery),
        this.postgresqlMcp.query(orphanedPlacesQuery),
      ]);

      const issues: Array<{
        issueType: string;
        count: number;
        description: string;
      }> = [];

      if (tripsWithoutDays && tripsWithoutDays.length > 0 && tripsWithoutDays[0].count > 0) {
        issues.push({
          issueType: 'trips_without_days',
          count: Number(tripsWithoutDays[0].count),
          description: '存在没有关联任何天的行程',
        });
      }

      if (daysWithoutItems && daysWithoutItems.length > 0 && daysWithoutItems[0].count > 0) {
        issues.push({
          issueType: 'days_without_items',
          count: Number(daysWithoutItems[0].count),
          description: '存在没有关联任何行程项的天',
        });
      }

      if (itemsWithoutPlaces && itemsWithoutPlaces.length > 0 && itemsWithoutPlaces[0].count > 0) {
        issues.push({
          issueType: 'items_without_places',
          count: Number(itemsWithoutPlaces[0].count),
          description: '存在没有关联地点的行程项',
        });
      }

      if (orphanedPlaces && orphanedPlaces.length > 0 && orphanedPlaces[0].count > 0) {
        issues.push({
          issueType: 'orphaned_places',
          count: Number(orphanedPlaces[0].count),
          description: '存在没有被任何行程项引用的孤立地点',
        });
      }

      // 计算整体健康度（基于问题数量）
      const totalIssues = issues.reduce((sum, issue) => sum + issue.count, 0);
      const overallHealth = totalIssues === 0 ? 1.0 : Math.max(0, 1.0 - totalIssues / 1000); // 假设1000个问题为最差情况

      return { issues, overallHealth };
    } catch (error: any) {
      this.logger.error(`数据完整性检查失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 评估时效性
   */
  private async assessTimeliness(
    config: DataSourceConfig,
    data: any
  ): Promise<number> {
    const now = new Date();
    const lastUpdated = data.lastUpdated;
    const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

    // 时效性分数：基于数据新鲜度阈值
    // 如果数据在阈值内，分数为1.0；超过阈值，分数递减
    const threshold = config.freshnessThresholdHours;
    if (hoursSinceUpdate <= threshold) {
      return 1.0;
    } else {
      // 超过阈值后，每超过1小时，分数减少0.1，最低0.0
      const penalty = Math.min((hoursSinceUpdate - threshold) * 0.1, 1.0);
      return Math.max(1.0 - penalty, 0.0);
    }
  }

  /**
   * 评估可追溯性
   */
  private async assessTraceability(
    config: DataSourceConfig,
    data: any
  ): Promise<number> {
    // 检查是否有metadata、source等信息
    let traceableFields = 0;
    let totalFields = 0;

    if (data.metadata) {
      totalFields++;
      if (data.metadata.source) traceableFields++;
      if (data.metadata.timestamp) traceableFields++;
      if (data.metadata.version) traceableFields++;
    }

    return totalFields > 0 ? traceableFields / totalFields : 1.0;
  }

  /**
   * 计算总体分数（加权平均）
   */
  private calculateOverallScore(metrics: {
    completeness: number;
    accuracy: number;
    consistency: number;
    timeliness: number;
    traceability: number;
  }): number {
    // 权重配置
    const weights = {
      completeness: 0.3,
      accuracy: 0.3,
      consistency: 0.2,
      timeliness: 0.15,
      traceability: 0.05,
    };

    return (
      metrics.completeness * weights.completeness +
      metrics.accuracy * weights.accuracy +
      metrics.consistency * weights.consistency +
      metrics.timeliness * weights.timeliness +
      metrics.traceability * weights.traceability
    );
  }

  /**
   * 检查告警规则
   */
  private async checkAlertRules(
    config: DataSourceConfig,
    assessment: {
      overallScore: number;
      timeliness: number;
      completeness: number;
      accuracy: number;
    }
  ): Promise<Array<{
    monitorId: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    alertType: string;
    message: string;
    details: any;
  }>> {
    const alerts: Array<{
      monitorId: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      alertType: string;
      message: string;
      details: any;
    }> = [];

    // 获取监控记录ID
    const monitor = await this.prisma.dataQualityMonitor.findUnique({
      where: {
        dataSource_dataType: {
          dataSource: config.dataSource,
          dataType: config.dataType,
        },
      },
    });

    if (!monitor) {
      return alerts; // 监控记录不存在，跳过告警
    }

    // CRITICAL: 质量分数 < 0.6
    if (assessment.overallScore < 0.6) {
      alerts.push({
        monitorId: monitor.id,
        severity: 'CRITICAL',
        alertType: 'QUALITY_CRITICAL',
        message: `数据质量严重不足: ${(assessment.overallScore * 100).toFixed(1)}%`,
        details: { overallScore: assessment.overallScore },
      });
    }

    // HIGH: 质量分数 < 0.8
    if (assessment.overallScore < 0.8) {
      alerts.push({
        monitorId: monitor.id,
        severity: 'HIGH',
        alertType: 'QUALITY_LOW',
        message: `数据质量不足: ${(assessment.overallScore * 100).toFixed(1)}%`,
        details: { overallScore: assessment.overallScore },
      });
    }

    // HIGH: 数据过期超过阈值
    if (assessment.timeliness < 0.5) {
      alerts.push({
        monitorId: monitor.id,
        severity: 'HIGH',
        alertType: 'DATA_EXPIRED',
        message: '数据已过期，需要更新',
        details: { timeliness: assessment.timeliness },
      });
    }

    // MEDIUM: 完整性不足
    if (assessment.completeness < 0.9) {
      alerts.push({
        monitorId: monitor.id,
        severity: 'MEDIUM',
        alertType: 'COMPLETENESS_LOW',
        message: `数据完整性不足: ${(assessment.completeness * 100).toFixed(1)}%`,
        details: { completeness: assessment.completeness },
      });
    }

    return alerts;
  }

  /**
   * 更新或创建监控记录
   */
  private async upsertMonitorRecord(
    config: DataSourceConfig,
    assessment: {
      completeness: number;
      accuracy: number;
      consistency: number;
      timeliness: number;
      traceability: number;
      overallScore: number;
      recordCount: number;
      lastUpdated: Date;
    }
  ): Promise<void> {
    // 确定状态
    let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (assessment.overallScore < 0.6) {
      status = 'CRITICAL';
    } else if (assessment.overallScore < 0.8) {
      status = 'WARNING';
    }

    await this.prisma.dataQualityMonitor.upsert({
      where: {
        dataSource_dataType: {
          dataSource: config.dataSource,
          dataType: config.dataType,
        },
      },
      create: {
        dataSource: config.dataSource,
        dataType: config.dataType,
        countryCode: config.countryCode,
        completeness: assessment.completeness,
        accuracy: assessment.accuracy,
        consistency: assessment.consistency,
        timeliness: assessment.timeliness,
        traceability: assessment.traceability,
        overallScore: assessment.overallScore,
        lastUpdated: assessment.lastUpdated,
        lastVerified: new Date(),
        recordCount: assessment.recordCount,
        status,
      },
      update: {
        completeness: assessment.completeness,
        accuracy: assessment.accuracy,
        consistency: assessment.consistency,
        timeliness: assessment.timeliness,
        traceability: assessment.traceability,
        overallScore: assessment.overallScore,
        lastUpdated: assessment.lastUpdated,
        lastVerified: new Date(),
        recordCount: assessment.recordCount,
        status,
      },
    });
  }

  /**
   * 获取数据源配置列表
   */
  private async getDataSourceConfigs(): Promise<DataSourceConfig[]> {
    // 从KnowledgeFile表获取所有数据源（通过category和filename判断）
    const knowledgeFiles = await this.prisma.knowledgeFile.findMany({
      where: {
        category: 'PHYSICAL_REALITY',
        filename: {
          contains: 'road-status',
        },
      },
      select: {
        filename: true,
        category: true,
        updatedAt: true,
      },
    });

    return knowledgeFiles.map(file => {
      // 从filename解析数据类型和国家代码
      const filename = file.filename;
      let dataType = 'unknown';
      let countryCode = 'UNKNOWN';
      
      if (filename.includes('road-status')) {
        dataType = 'road_status';
      } else if (filename.includes('ferry')) {
        dataType = 'ferry_schedules';
      } else if (filename.includes('weather')) {
        dataType = 'weather_windows';
      }
      
      // 从filename提取国家代码（简化版）
      const countryMatch = filename.match(/(ch|no|pe|is|gl|fo|nz|sj|ar)/i);
      if (countryMatch) {
        countryCode = countryMatch[1].toUpperCase();
      }

      return {
        dataSource: file.filename,
        dataType,
        countryCode,
        freshnessThresholdHours: this.getFreshnessThreshold(dataType),
        qualityThreshold: 0.8,
      };
    });
  }

  /**
   * 获取数据源数据
   */
  private async fetchDataSourceData(config: DataSourceConfig): Promise<{
    recordCount: number;
    lastUpdated: Date;
    metadata?: any;
    [key: string]: any;
  }> {
    // 从KnowledgeFile和Chunk表获取数据统计
    const knowledgeFile = await this.prisma.knowledgeFile.findFirst({
      where: {
        filename: config.dataSource,
        category: 'PHYSICAL_REALITY',
      },
      include: {
        chunks: {
          select: {
            id: true,
            metadata: true,
          },
          take: 1, // 只取一个chunk用于评估
        },
      },
    });

    if (!knowledgeFile) {
      return {
        recordCount: 0,
        lastUpdated: new Date(),
      };
    }

    return {
      recordCount: knowledgeFile.chunks.length,
      lastUpdated: knowledgeFile.updatedAt,
      metadata: {
        filename: knowledgeFile.filename,
        category: knowledgeFile.category,
      },
      sampleData: {},
    };
  }

  /**
   * 获取必需字段（根据数据类型）
   */
  private getRequiredFields(dataType: string): string[] {
    const fieldMap: Record<string, string[]> = {
      road_status: ['segments', 'region', 'countryCode'],
      ferry_schedules: ['routes', 'origin', 'destination'],
      weather_windows: ['regions', 'center', 'countryCode'],
    };

    return fieldMap[dataType] || [];
  }

  /**
   * 获取验证规则（根据数据类型）
   */
  private getValidationRules(dataType: string): Record<string, (value: any) => boolean> {
    const rules: Record<string, Record<string, (value: any) => boolean>> = {
      road_status: {
        'segments[].start.lat': (v) => typeof v === 'number' && v >= -90 && v <= 90,
        'segments[].start.lng': (v) => typeof v === 'number' && v >= -180 && v <= 180,
      },
      ferry_schedules: {
        'routes[].origin.lat': (v) => typeof v === 'number' && v >= -90 && v <= 90,
        'routes[].origin.lng': (v) => typeof v === 'number' && v >= -180 && v <= 180,
      },
      weather_windows: {
        'regions[].center.lat': (v) => typeof v === 'number' && v >= -90 && v <= 90,
        'regions[].center.lng': (v) => typeof v === 'number' && v >= -180 && v <= 180,
      },
    };

    return rules[dataType] || {};
  }

  /**
   * 获取数据新鲜度阈值（小时）
   */
  private getFreshnessThreshold(dataType: string): number {
    const thresholds: Record<string, number> = {
      road_status: 24, // 道路状态：24小时
      ferry_schedules: 168, // 渡轮时刻表：7天
      weather_windows: 6, // 天气窗口：6小时
    };

    return thresholds[dataType] || 24;
  }
}
