// src/trips/readiness/services/physical-reality-quality-monitor.service.ts

/**
 * Physical Reality 数据质量监控服务
 * 
 * 监控Physical Reality数据的质量指标：
 * - 数据完整性（覆盖率）
 * - 数据准确性（验证）
 * - 数据时效性（更新时间）
 * - 检索性能（查询延迟）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PhysicalRealityRetrievalService } from './physical-reality-retrieval.service';

export interface PhysicalRealityQualityMetrics {
  /** 数据完整性指标 */
  completeness: {
    /** 道路状态数据完整性 */
    roadStatus: {
      totalChunks: number;
      totalRegions: number;
      regionsWithData: number;
      coverageRate: number; // 覆盖率（%）
      avgChunksPerRegion: number;
    };
    /** 渡轮时刻表数据完整性 */
    ferrySchedules: {
      totalChunks: number;
      totalRegions: number;
      regionsWithData: number;
      coverageRate: number;
      avgChunksPerRegion: number;
    };
    /** 天气窗口数据完整性 */
    weatherWindows: {
      totalChunks: number;
      totalRegions: number;
      regionsWithData: number;
      coverageRate: number;
      avgChunksPerRegion: number;
    };
    /** 总体完整性 */
    overall: {
      totalChunks: number;
      totalRegions: number;
      regionsWithData: number;
      coverageRate: number;
    };
  };

  /** 数据准确性指标 */
  accuracy: {
    /** 有metadata的chunks比例 */
    metadataCoverage: number;
    /** 有embedding的chunks比例 */
    embeddingCoverage: number;
    /** 有keywords的chunks比例 */
    keywordsCoverage: number;
  };

  /** 数据时效性指标 */
  timeliness: {
    /** 最新更新时间 */
    lastUpdated: Date | null;
    /** 最旧更新时间 */
    oldestUpdated: Date | null;
    /** 平均更新天数（相对于今天） */
    avgDaysSinceUpdate: number;
    /** 超过30天未更新的chunks数量 */
    staleChunks30Days: number;
    /** 超过90天未更新的chunks数量 */
    staleChunks90Days: number;
  };

  /** 检索性能指标 */
  retrievalPerformance: {
    /** 平均检索延迟（ms） */
    avgLatency: number;
    /** P95检索延迟（ms） */
    p95Latency: number;
    /** 检索成功率 */
    successRate: number;
    /** 总检索次数 */
    totalRetrievals: number;
  };
}

export interface QualityReport {
  /** 报告生成时间 */
  generatedAt: Date;
  /** 质量指标 */
  metrics: PhysicalRealityQualityMetrics;
  /** 质量问题列表 */
  issues: Array<{
    level: 'info' | 'warning' | 'error';
    category: 'completeness' | 'accuracy' | 'timeliness' | 'performance';
    message: string;
    recommendation?: string;
  }>;
  /** 质量评分（0-100） */
  qualityScore: number;
}

@Injectable()
export class PhysicalRealityQualityMonitorService {
  private readonly logger = new Logger(PhysicalRealityQualityMonitorService.name);
  private readonly expectedRegions = [
    'iceland',
    'greenland',
    'alps',
    'svalbard',
    'faroe-islands',
    'argentina',
    'lofoten',
    'new-zealand-south-island',
  ];

  private retrievalLatencies: number[] = [];
  private retrievalSuccesses: number = 0;
  private retrievalFailures: number = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly physicalRealityService?: PhysicalRealityRetrievalService
  ) {}

  /**
   * 生成质量报告
   */
  async generateQualityReport(): Promise<QualityReport> {
    this.logger.debug('Generating Physical Reality data quality report...');

    const metrics = await this.calculateMetrics();
    const issues = this.identifyIssues(metrics);
    const qualityScore = this.calculateQualityScore(metrics, issues);

    return {
      generatedAt: new Date(),
      metrics,
      issues,
      qualityScore,
    };
  }

  /**
   * 计算质量指标
   */
  private async calculateMetrics(): Promise<PhysicalRealityQualityMetrics> {
    // 1. 数据完整性
    const completeness = await this.calculateCompleteness();

    // 2. 数据准确性
    const accuracy = await this.calculateAccuracy();

    // 3. 数据时效性
    const timeliness = await this.calculateTimeliness();

    // 4. 检索性能
    const retrievalPerformance = this.calculateRetrievalPerformance();

    return {
      completeness,
      accuracy,
      timeliness,
      retrievalPerformance,
    };
  }

  /**
   * 计算数据完整性指标
   */
  private async calculateCompleteness(): Promise<PhysicalRealityQualityMetrics['completeness']> {
    // 统计各类型chunks
    const roadStatusChunks = await this.prisma.chunk.count({
      where: { type: 'road_status' },
    });

    const ferrySchedulesChunks = await this.prisma.chunk.count({
      where: { type: 'ferry_schedules' },
    });

    const weatherWindowsChunks = await this.prisma.chunk.count({
      where: { type: 'weather_windows' },
    });

    // 统计各区域的KnowledgeFile
    const roadStatusFiles = await this.prisma.knowledgeFile.findMany({
      where: { category: 'road_status' },
      select: { filename: true },
    });

    const ferrySchedulesFiles = await this.prisma.knowledgeFile.findMany({
      where: { category: 'ferry_schedules' },
      select: { filename: true },
    });

    const weatherWindowsFiles = await this.prisma.knowledgeFile.findMany({
      where: { category: 'weather_windows' },
      select: { filename: true },
    });

    // 提取区域（从filename中）
    const roadStatusRegions = new Set(
      roadStatusFiles.map(f => this.extractRegionFromFilename(f.filename)).filter(Boolean)
    );
    const ferrySchedulesRegions = new Set(
      ferrySchedulesFiles.map(f => this.extractRegionFromFilename(f.filename)).filter(Boolean)
    );
    const weatherWindowsRegions = new Set(
      weatherWindowsFiles.map(f => this.extractRegionFromFilename(f.filename)).filter(Boolean)
    );

    const totalRegions = this.expectedRegions.length;

    return {
      roadStatus: {
        totalChunks: roadStatusChunks,
        totalRegions,
        regionsWithData: roadStatusRegions.size,
        coverageRate: (roadStatusRegions.size / totalRegions) * 100,
        avgChunksPerRegion: roadStatusRegions.size > 0 ? roadStatusChunks / roadStatusRegions.size : 0,
      },
      ferrySchedules: {
        totalChunks: ferrySchedulesChunks,
        totalRegions,
        regionsWithData: ferrySchedulesRegions.size,
        coverageRate: (ferrySchedulesRegions.size / totalRegions) * 100,
        avgChunksPerRegion: ferrySchedulesRegions.size > 0 ? ferrySchedulesChunks / ferrySchedulesRegions.size : 0,
      },
      weatherWindows: {
        totalChunks: weatherWindowsChunks,
        totalRegions,
        regionsWithData: weatherWindowsRegions.size,
        coverageRate: (weatherWindowsRegions.size / totalRegions) * 100,
        avgChunksPerRegion: weatherWindowsRegions.size > 0 ? weatherWindowsChunks / weatherWindowsRegions.size : 0,
      },
      overall: {
        totalChunks: roadStatusChunks + ferrySchedulesChunks + weatherWindowsChunks,
        totalRegions,
        regionsWithData: new Set([
          ...roadStatusRegions,
          ...ferrySchedulesRegions,
          ...weatherWindowsRegions,
        ]).size,
        coverageRate: (new Set([
          ...roadStatusRegions,
          ...ferrySchedulesRegions,
          ...weatherWindowsRegions,
        ]).size / totalRegions) * 100,
      },
    };
  }

  /**
   * 计算数据准确性指标
   */
  private async calculateAccuracy(): Promise<PhysicalRealityQualityMetrics['accuracy']> {
    const totalChunks = await this.prisma.chunk.count({
      where: {
        type: {
          in: ['road_status', 'ferry_schedules', 'weather_windows'],
        },
      },
    });

    // 使用原始 SQL 查询，因为 Prisma 对 JSON null 检查支持有限
    const chunksWithMetadataResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM chunks
      WHERE type IN ('road_status', 'ferry_schedules', 'weather_windows')
        AND metadata IS NOT NULL
    `;
    const chunksWithMetadata = Number(chunksWithMetadataResult[0]?.count || 0);

    const chunksWithEmbedding = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM chunks
      WHERE type IN ('road_status', 'ferry_schedules', 'weather_windows')
        AND embedding IS NOT NULL
    `;

    const chunksWithKeywords = await this.prisma.chunk.count({
      where: {
        type: {
          in: ['road_status', 'ferry_schedules', 'weather_windows'],
        },
        keywords: { isEmpty: false },
      },
    });

    const embeddingCount = Number(chunksWithEmbedding[0]?.count || 0);

    return {
      metadataCoverage: totalChunks > 0 ? (chunksWithMetadata / totalChunks) * 100 : 0,
      embeddingCoverage: totalChunks > 0 ? (embeddingCount / totalChunks) * 100 : 0,
      keywordsCoverage: totalChunks > 0 ? (chunksWithKeywords / totalChunks) * 100 : 0,
    };
  }

  /**
   * 计算数据时效性指标
   */
  private async calculateTimeliness(): Promise<PhysicalRealityQualityMetrics['timeliness']> {
    const files = await this.prisma.knowledgeFile.findMany({
      where: {
        category: {
          in: ['road_status', 'ferry_schedules', 'weather_windows'],
        },
      },
      select: {
        lastUpdated: true,
      },
      orderBy: {
        lastUpdated: 'desc',
      },
    });

    if (files.length === 0) {
      return {
        lastUpdated: null,
        oldestUpdated: null,
        avgDaysSinceUpdate: 0,
        staleChunks30Days: 0,
        staleChunks90Days: 0,
      };
    }

    const lastUpdated = files[0].lastUpdated;
    const oldestUpdated = files[files.length - 1].lastUpdated;
    const now = new Date();

    const avgDaysSinceUpdate =
      files.reduce((sum, f) => {
        const daysSince = Math.floor((now.getTime() - f.lastUpdated.getTime()) / (1000 * 60 * 60 * 24));
        return sum + daysSince;
      }, 0) / files.length;

    // 统计超过30天和90天未更新的chunks
    const staleChunks30Days = files.filter(
      f => Math.floor((now.getTime() - f.lastUpdated.getTime()) / (1000 * 60 * 60 * 24)) > 30
    ).length;

    const staleChunks90Days = files.filter(
      f => Math.floor((now.getTime() - f.lastUpdated.getTime()) / (1000 * 60 * 60 * 24)) > 90
    ).length;

    return {
      lastUpdated,
      oldestUpdated,
      avgDaysSinceUpdate: Math.round(avgDaysSinceUpdate * 10) / 10,
      staleChunks30Days,
      staleChunks90Days,
    };
  }

  /**
   * 计算检索性能指标
   */
  private calculateRetrievalPerformance(): PhysicalRealityQualityMetrics['retrievalPerformance'] {
    if (this.retrievalLatencies.length === 0) {
      return {
        avgLatency: 0,
        p95Latency: 0,
        successRate: 0,
        totalRetrievals: 0,
      };
    }

    const sortedLatencies = [...this.retrievalLatencies].sort((a, b) => a - b);
    const totalRetrievals = this.retrievalSuccesses + this.retrievalFailures;

    return {
      avgLatency: Math.round(
        sortedLatencies.reduce((sum, l) => sum + l, 0) / sortedLatencies.length
      ),
      p95Latency: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0,
      successRate: totalRetrievals > 0 ? (this.retrievalSuccesses / totalRetrievals) * 100 : 0,
      totalRetrievals,
    };
  }

  /**
   * 识别质量问题
   */
  private identifyIssues(metrics: PhysicalRealityQualityMetrics): QualityReport['issues'] {
    const issues: QualityReport['issues'] = [];

    // 完整性问题
    if (metrics.completeness.overall.coverageRate < 80) {
      issues.push({
        level: 'warning',
        category: 'completeness',
        message: `数据覆盖率较低: ${metrics.completeness.overall.coverageRate.toFixed(1)}%`,
        recommendation: '建议补充缺失区域的数据',
      });
    }

    if (metrics.completeness.roadStatus.coverageRate < 70) {
      issues.push({
        level: 'warning',
        category: 'completeness',
        message: `道路状态数据覆盖率较低: ${metrics.completeness.roadStatus.coverageRate.toFixed(1)}%`,
        recommendation: '建议补充道路状态数据',
      });
    }

    // 准确性问题
    if (metrics.accuracy.metadataCoverage < 95) {
      issues.push({
        level: 'warning',
        category: 'accuracy',
        message: `Metadata覆盖率较低: ${metrics.accuracy.metadataCoverage.toFixed(1)}%`,
        recommendation: '建议检查并补充缺失的metadata',
      });
    }

    if (metrics.accuracy.embeddingCoverage < 95) {
      issues.push({
        level: 'error',
        category: 'accuracy',
        message: `Embedding覆盖率较低: ${metrics.accuracy.embeddingCoverage.toFixed(1)}%`,
        recommendation: '建议重新生成缺失的embeddings',
      });
    }

    // 时效性问题
    if (metrics.timeliness.avgDaysSinceUpdate > 90) {
      issues.push({
        level: 'warning',
        category: 'timeliness',
        message: `数据平均更新天数较长: ${metrics.timeliness.avgDaysSinceUpdate}天`,
        recommendation: '建议更新数据，保持数据新鲜度',
      });
    }

    if (metrics.timeliness.staleChunks90Days > 0) {
      issues.push({
        level: 'warning',
        category: 'timeliness',
        message: `${metrics.timeliness.staleChunks90Days}个文件超过90天未更新`,
        recommendation: '建议更新过期数据',
      });
    }

    // 性能问题
    if (metrics.retrievalPerformance.avgLatency > 500) {
      issues.push({
        level: 'warning',
        category: 'performance',
        message: `平均检索延迟较高: ${metrics.retrievalPerformance.avgLatency}ms`,
        recommendation: '建议优化检索性能',
      });
    }

    if (metrics.retrievalPerformance.successRate < 95) {
      issues.push({
        level: 'error',
        category: 'performance',
        message: `检索成功率较低: ${metrics.retrievalPerformance.successRate.toFixed(1)}%`,
        recommendation: '建议检查检索服务状态',
      });
    }

    return issues;
  }

  /**
   * 计算质量评分（0-100）
   */
  private calculateQualityScore(
    metrics: PhysicalRealityQualityMetrics,
    issues: QualityReport['issues']
  ): number {
    let score = 100;

    // 完整性权重：30%
    const completenessScore = metrics.completeness.overall.coverageRate;
    score -= (100 - completenessScore) * 0.3;

    // 准确性权重：30%
    const accuracyScore =
      (metrics.accuracy.metadataCoverage +
        metrics.accuracy.embeddingCoverage +
        metrics.accuracy.keywordsCoverage) /
      3;
    score -= (100 - accuracyScore) * 0.3;

    // 时效性权重：20%
    const timelinessScore = Math.max(
      0,
      100 - (metrics.timeliness.avgDaysSinceUpdate / 90) * 100
    );
    score -= (100 - timelinessScore) * 0.2;

    // 性能权重：20%
    const performanceScore = metrics.retrievalPerformance.successRate;
    score -= (100 - performanceScore) * 0.2;

    // 根据问题数量扣分
    const errorCount = issues.filter(i => i.level === 'error').length;
    const warningCount = issues.filter(i => i.level === 'warning').length;
    score -= errorCount * 5;
    score -= warningCount * 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * 记录检索性能
   */
  recordRetrieval(latency: number, success: boolean): void {
    this.retrievalLatencies.push(latency);
    
    // 保持最近1000次检索的记录
    if (this.retrievalLatencies.length > 1000) {
      this.retrievalLatencies = this.retrievalLatencies.slice(-1000);
    }

    if (success) {
      this.retrievalSuccesses++;
    } else {
      this.retrievalFailures++;
    }
  }

  /**
   * 从filename中提取区域
   */
  private extractRegionFromFilename(filename: string): string | null {
    for (const region of this.expectedRegions) {
      if (filename.includes(region)) {
        return region;
      }
    }
    return null;
  }
}
