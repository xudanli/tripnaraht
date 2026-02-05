// src/agent/context-engine/services/context-performance-analysis.service.ts
/**
 * Context Engine Performance Analysis Service
 * 
 * Phase 4.3 优化: 性能分析报告生成
 * 
 * 功能：
 * - 生成 Context Package 构建性能报告
 * - 分析缓存命中率趋势
 * - 识别性能瓶颈
 * - 提供优化建议
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextPrometheusMetricsService } from './context-prometheus-metrics.service';

export interface PerformanceAnalysisReport {
  /** 报告生成时间 */
  timestamp: Date;
  
  /** 分析时间段 */
  timeRange: {
    start: Date;
    end: Date;
  };
  
  /** Context Package 构建性能 */
  buildPerformance: {
    /** 平均构建时间（ms） */
    avgBuildTimeMs: number;
    /** P95 构建时间（ms） */
    p95BuildTimeMs: number;
    /** P99 构建时间（ms） */
    p99BuildTimeMs: number;
    /** 构建总数 */
    totalBuilds: number;
    /** 构建速率（次/秒） */
    buildRate: number;
  };
  
  /** 缓存性能 */
  cachePerformance: {
    /** L1 缓存命中率 */
    l1HitRate: number;
    /** L2 缓存命中率 */
    l2HitRate: number;
    /** L3 缓存命中率 */
    l3HitRate: number;
    /** 总体缓存命中率 */
    overallHitRate: number;
    /** 缓存大小 */
    cacheSizes: {
      l1: number;
      l2: number;
      l3: number;
    };
  };
  
  /** Token 使用情况 */
  tokenUsage: {
    /** 平均 Token 使用量 */
    avgTokenUsage: number;
    /** 平均 Token 预算 */
    avgTokenBudget: number;
    /** Token 预算使用率 */
    budgetUtilization: number;
    /** 超预算次数 */
    overBudgetCount: number;
  };
  
  /** Block 统计 */
  blockStats: {
    /** 平均 Block 数量 */
    avgBlockCount: number;
    /** Block 类型分布 */
    blockTypeDistribution: Record<string, number>;
    /** 平均优先级 */
    avgPriority: number;
  };
  
  /** Context Learning 性能 */
  learningPerformance?: {
    /** 学习事件总数 */
    totalEvents: number;
    /** 平均处理时间（ms） */
    avgProcessingTimeMs: number;
    /** 平均置信度 */
    avgConfidence: number;
    /** 平均样本大小 */
    avgSampleSize: number;
    /** 优先级更新次数 */
    priorityUpdates: number;
  };
  
  /** 性能瓶颈识别 */
  bottlenecks: Array<{
    type: 'build_time' | 'cache_miss' | 'token_over_budget' | 'learning_slow';
    severity: 'low' | 'medium' | 'high';
    description: string;
    recommendation: string;
  }>;
  
  /** 优化建议 */
  recommendations: string[];
}

@Injectable()
export class ContextPerformanceAnalysisService {
  private readonly logger = new Logger(ContextPerformanceAnalysisService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly metrics?: ContextPrometheusMetricsService,
  ) {
    this.logger.log('性能分析服务已初始化');
  }

  /**
   * 生成性能分析报告
   * 
   * 注意：这是一个示例实现，实际应该从 Prometheus 查询历史数据
   * 或者从数据库查询聚合后的指标数据
   */
  async generateReport(
    timeRange: { start: Date; end: Date },
    options?: {
      includeLearning?: boolean;
      includeBottlenecks?: boolean;
    },
  ): Promise<PerformanceAnalysisReport> {
    this.logger.log(`生成性能分析报告: ${timeRange.start} - ${timeRange.end}`);

    // 这里应该从 Prometheus 或数据库查询实际数据
    // 目前返回示例数据
    const report: PerformanceAnalysisReport = {
      timestamp: new Date(),
      timeRange,
      buildPerformance: {
        avgBuildTimeMs: 0,
        p95BuildTimeMs: 0,
        p99BuildTimeMs: 0,
        totalBuilds: 0,
        buildRate: 0,
      },
      cachePerformance: {
        l1HitRate: 0,
        l2HitRate: 0,
        l3HitRate: 0,
        overallHitRate: 0,
        cacheSizes: {
          l1: 0,
          l2: 0,
          l3: 0,
        },
      },
      tokenUsage: {
        avgTokenUsage: 0,
        avgTokenBudget: 0,
        budgetUtilization: 0,
        overBudgetCount: 0,
      },
      blockStats: {
        avgBlockCount: 0,
        blockTypeDistribution: {},
        avgPriority: 0,
      },
      bottlenecks: [],
      recommendations: [],
    };

    if (options?.includeLearning) {
      report.learningPerformance = {
        totalEvents: 0,
        avgProcessingTimeMs: 0,
        avgConfidence: 0,
        avgSampleSize: 0,
        priorityUpdates: 0,
      };
    }

    if (options?.includeBottlenecks) {
      report.bottlenecks = this.identifyBottlenecks(report);
      report.recommendations = this.generateRecommendations(report);
    }

    return report;
  }

  /**
   * 识别性能瓶颈
   */
  private identifyBottlenecks(
    report: PerformanceAnalysisReport,
  ): PerformanceAnalysisReport['bottlenecks'] {
    const bottlenecks: PerformanceAnalysisReport['bottlenecks'] = [];

    // 检查构建时间
    if (report.buildPerformance.p95BuildTimeMs > 2000) {
      bottlenecks.push({
        type: 'build_time',
        severity: report.buildPerformance.p95BuildTimeMs > 5000 ? 'high' : 'medium',
        description: `Context Package 构建 P95 延迟为 ${report.buildPerformance.p95BuildTimeMs}ms，超过 2000ms 阈值`,
        recommendation: '考虑优化 RAG 查询性能、增加缓存预热、或优化 Block 构建逻辑',
      });
    }

    // 检查缓存命中率
    if (report.cachePerformance.overallHitRate < 0.5) {
      bottlenecks.push({
        type: 'cache_miss',
        severity: report.cachePerformance.overallHitRate < 0.3 ? 'high' : 'medium',
        description: `总体缓存命中率为 ${(report.cachePerformance.overallHitRate * 100).toFixed(1)}%，低于 50% 阈值`,
        recommendation: '检查缓存键设计、增加缓存预热、或延长缓存 TTL',
      });
    }

    // 检查 Token 使用
    if (report.tokenUsage.budgetUtilization > 0.9) {
      bottlenecks.push({
        type: 'token_over_budget',
        severity: report.tokenUsage.budgetUtilization > 0.95 ? 'high' : 'medium',
        description: `Token 预算使用率为 ${(report.tokenUsage.budgetUtilization * 100).toFixed(1)}%，接近上限`,
        recommendation: '考虑增加 Token 预算、优化 Block 压缩策略、或减少不必要的 Block',
      });
    }

    // 检查学习性能
    if (report.learningPerformance && report.learningPerformance.avgProcessingTimeMs > 1000) {
      bottlenecks.push({
        type: 'learning_slow',
        severity: report.learningPerformance.avgProcessingTimeMs > 2000 ? 'high' : 'medium',
        description: `Context Learning 平均处理时间为 ${report.learningPerformance.avgProcessingTimeMs}ms，超过 1000ms 阈值`,
        recommendation: '考虑启用批量学习、优化数据库查询、或增加学习结果缓存',
      });
    }

    return bottlenecks;
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(
    report: PerformanceAnalysisReport,
  ): string[] {
    const recommendations: string[] = [];

    // 基于瓶颈生成建议
    for (const bottleneck of report.bottlenecks) {
      if (bottleneck.severity === 'high') {
        recommendations.push(`🔴 高优先级: ${bottleneck.recommendation}`);
      } else if (bottleneck.severity === 'medium') {
        recommendations.push(`🟡 中优先级: ${bottleneck.recommendation}`);
      }
    }

    // 通用建议
    if (report.cachePerformance.l1HitRate < 0.7) {
      recommendations.push('💡 建议：增加 L1 缓存大小或优化缓存键设计以提高 L1 命中率');
    }

    if (report.buildPerformance.buildRate > 10) {
      recommendations.push('💡 建议：考虑启用批量构建以处理高并发请求');
    }

    if (report.learningPerformance && report.learningPerformance.avgConfidence < 0.5) {
      recommendations.push('💡 建议：增加学习样本数量或调整学习权重以提高置信度');
    }

    return recommendations;
  }

  /**
   * 导出报告为 JSON
   */
  async exportReportAsJson(report: PerformanceAnalysisReport): Promise<string> {
    return JSON.stringify(report, null, 2);
  }

  /**
   * 导出报告为 Markdown
   */
  async exportReportAsMarkdown(report: PerformanceAnalysisReport): Promise<string> {
    const lines: string[] = [];

    lines.push('# Context Engine 性能分析报告');
    lines.push('');
    lines.push(`**生成时间**: ${report.timestamp.toISOString()}`);
    lines.push(`**分析时间段**: ${report.timeRange.start.toISOString()} - ${report.timeRange.end.toISOString()}`);
    lines.push('');

    // 构建性能
    lines.push('## Context Package 构建性能');
    lines.push('');
    lines.push(`- 平均构建时间: ${report.buildPerformance.avgBuildTimeMs.toFixed(2)}ms`);
    lines.push(`- P95 构建时间: ${report.buildPerformance.p95BuildTimeMs.toFixed(2)}ms`);
    lines.push(`- P99 构建时间: ${report.buildPerformance.p99BuildTimeMs.toFixed(2)}ms`);
    lines.push(`- 构建总数: ${report.buildPerformance.totalBuilds}`);
    lines.push(`- 构建速率: ${report.buildPerformance.buildRate.toFixed(2)} 次/秒`);
    lines.push('');

    // 缓存性能
    lines.push('## 缓存性能');
    lines.push('');
    lines.push(`- L1 缓存命中率: ${(report.cachePerformance.l1HitRate * 100).toFixed(1)}%`);
    lines.push(`- L2 缓存命中率: ${(report.cachePerformance.l2HitRate * 100).toFixed(1)}%`);
    lines.push(`- L3 缓存命中率: ${(report.cachePerformance.l3HitRate * 100).toFixed(1)}%`);
    lines.push(`- 总体缓存命中率: ${(report.cachePerformance.overallHitRate * 100).toFixed(1)}%`);
    lines.push(`- L1 缓存大小: ${report.cachePerformance.cacheSizes.l1}`);
    lines.push(`- L2 缓存大小: ${report.cachePerformance.cacheSizes.l2}`);
    lines.push(`- L3 缓存大小: ${report.cachePerformance.cacheSizes.l3}`);
    lines.push('');

    // Token 使用
    lines.push('## Token 使用情况');
    lines.push('');
    lines.push(`- 平均 Token 使用量: ${report.tokenUsage.avgTokenUsage.toFixed(0)}`);
    lines.push(`- 平均 Token 预算: ${report.tokenUsage.avgTokenBudget.toFixed(0)}`);
    lines.push(`- Token 预算使用率: ${(report.tokenUsage.budgetUtilization * 100).toFixed(1)}%`);
    lines.push(`- 超预算次数: ${report.tokenUsage.overBudgetCount}`);
    lines.push('');

    // Block 统计
    lines.push('## Block 统计');
    lines.push('');
    lines.push(`- 平均 Block 数量: ${report.blockStats.avgBlockCount.toFixed(1)}`);
    lines.push(`- 平均优先级: ${report.blockStats.avgPriority.toFixed(1)}`);
    lines.push('');
    if (Object.keys(report.blockStats.blockTypeDistribution).length > 0) {
      lines.push('### Block 类型分布');
      lines.push('');
      for (const [type, count] of Object.entries(report.blockStats.blockTypeDistribution)) {
        lines.push(`- ${type}: ${count}`);
      }
      lines.push('');
    }

    // Context Learning
    if (report.learningPerformance) {
      lines.push('## Context Learning 性能');
      lines.push('');
      lines.push(`- 学习事件总数: ${report.learningPerformance.totalEvents}`);
      lines.push(`- 平均处理时间: ${report.learningPerformance.avgProcessingTimeMs.toFixed(2)}ms`);
      lines.push(`- 平均置信度: ${(report.learningPerformance.avgConfidence * 100).toFixed(1)}%`);
      lines.push(`- 平均样本大小: ${report.learningPerformance.avgSampleSize.toFixed(0)}`);
      lines.push(`- 优先级更新次数: ${report.learningPerformance.priorityUpdates}`);
      lines.push('');
    }

    // 性能瓶颈
    if (report.bottlenecks.length > 0) {
      lines.push('## 性能瓶颈');
      lines.push('');
      for (const bottleneck of report.bottlenecks) {
        const severityEmoji = bottleneck.severity === 'high' ? '🔴' : bottleneck.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`### ${severityEmoji} ${bottleneck.type}`);
        lines.push('');
        lines.push(`**描述**: ${bottleneck.description}`);
        lines.push(`**建议**: ${bottleneck.recommendation}`);
        lines.push('');
      }
    }

    // 优化建议
    if (report.recommendations.length > 0) {
      lines.push('## 优化建议');
      lines.push('');
      for (const recommendation of report.recommendations) {
        lines.push(`- ${recommendation}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
