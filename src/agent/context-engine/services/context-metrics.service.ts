// src/agent/context-engine/services/context-metrics.service.ts
/**
 * Context Metrics Service
 * 
 * 监控 Context Package 的质量指标：
 * - Token 使用、压缩率、命中率
 * - 块类型分布、优先级分布
 * - 缓存命中率、构建耗时
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextPackage } from '../types/context-package.types';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../../skills/services/skills-registry.token';

/**
 * 监控指标记录
 */
export interface ContextMetricsRecord {
  /** 记录 ID */
  id: string;
  
  /** Trip ID */
  tripId?: string;
  
  /** 规划阶段 */
  phase: string;
  
  /** 当前 Agent */
  agent: string;
  
  /** 时间戳 */
  timestamp: string;
  
  /** Token 使用 */
  tokens: {
    total: number;
    budget: number;
    overBudget: boolean;
    overBudgetRate: number;
  };
  
  /** 块统计 */
  blocks: {
    total: number;
    public: number;
    private: number;
    compressed: boolean;
    compressionRate?: number;
  };
  
  /** 质量指标 */
  quality: {
    hitRate?: number;
    noiseRate: number;
    relevanceScore?: number;
    quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  };
  
  /** 性能指标 */
  performance: {
    buildTimeMs: number;
    cacheHit: boolean;
    skillsCalled: string[];
  };
  
  /** 块类型分布 */
  blockTypeDistribution: Record<string, number>;
  
  /** 优先级分布 */
  priorityDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * 聚合指标统计
 */
export interface ContextMetricsSummary {
  /** 时间范围 */
  timeRange: {
    start: string;
    end: string;
  };
  
  /** 总记录数 */
  totalRecords: number;
  
  /** 平均 Token 使用 */
  avgTokens: number;
  
  /** 平均压缩率 */
  avgCompressionRate: number;
  
  /** 平均命中率 */
  avgHitRate?: number;
  
  /** 平均噪音率 */
  avgNoiseRate: number;
  
  /** 缓存命中率 */
  cacheHitRate: number;
  
  /** 平均构建耗时（毫秒） */
  avgBuildTimeMs: number;
  
  /** 质量分布 */
  qualityDistribution: {
    EXCELLENT: number;
    GOOD: number;
    FAIR: number;
    POOR: number;
  };
  
  /** 最常用的块类型（Top 5） */
  topBlockTypes: Array<{ type: string; count: number }>;
}

@Injectable()
export class ContextMetricsService {
  private readonly logger = new Logger(ContextMetricsService.name);
  
  /**
   * 内存存储的指标记录（用于快速查询）
   * 实际生产环境应该存储到数据库
   */
  private readonly metricsStore = new Map<string, ContextMetricsRecord[]>();

  constructor(
    @Inject('PrismaService') @Optional() private readonly prisma?: PrismaService,
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private readonly skillsRegistry?: SkillsRegistryService,
  ) {}

  /**
   * 记录 Context Package 构建指标
   */
  async recordMetrics(
    contextPackage: ContextPackage,
    metadata: {
      tripId?: string;
      phase: string;
      agent: string;
      buildTimeMs: number;
      cacheHit: boolean;
      skillsCalled: string[];
      usedBlockKeys?: string[];
      userQuery?: string;
    },
  ): Promise<ContextMetricsRecord> {
    try {
      // 1. 计算基础指标
      const tokens = {
        total: contextPackage.totalTokens,
        budget: contextPackage.tokenBudget,
        overBudget: contextPackage.totalTokens > contextPackage.tokenBudget,
        overBudgetRate: contextPackage.totalTokens / contextPackage.tokenBudget,
      };

      const blocks = {
        total: contextPackage.blocks.length,
        public: contextPackage.blocks.filter((b) => b.visibility === 'public').length,
        private: contextPackage.blocks.filter((b) => b.visibility === 'private').length,
        compressed: contextPackage.compressed,
        compressionRate: contextPackage.metadata?.originalBlocksCount
          ? contextPackage.blocks.length / (contextPackage.metadata.originalBlocksCount as number)
          : undefined,
      };

      // 2. 计算质量指标（如果有 context.evaluate skill）
      let quality: ContextMetricsRecord['quality'] = {
        noiseRate: contextPackage.blocks.filter((b) => b.priority < 30).length / contextPackage.blocks.length || 0,
        quality: 'GOOD',
      };

      if (this.skillsRegistry) {
        const contextEvaluateSkill = this.skillsRegistry.getSkill('context.evaluate');
        if (contextEvaluateSkill) {
          try {
            const evaluation = await contextEvaluateSkill.execute({
              contextPackage,
              usedBlockKeys: metadata.usedBlockKeys,
              userQuery: metadata.userQuery,
              phase: metadata.phase,
            });

            quality = {
              hitRate: evaluation.metrics.hitRate,
              noiseRate: evaluation.metrics.noiseRate,
              relevanceScore: evaluation.metrics.relevanceScore,
              quality: evaluation.summary.quality,
            };
          } catch (error: any) {
            this.logger.warn(`调用 context.evaluate 失败: ${error.message}`);
          }
        }
      }

      // 3. 计算块类型分布
      const blockTypeDistribution: Record<string, number> = {};
      for (const block of contextPackage.blocks) {
        blockTypeDistribution[block.type] = (blockTypeDistribution[block.type] || 0) + 1;
      }

      // 4. 计算优先级分布
      const priorityDistribution = {
        high: contextPackage.blocks.filter((b) => b.priority >= 80).length,
        medium: contextPackage.blocks.filter((b) => b.priority >= 50 && b.priority < 80).length,
        low: contextPackage.blocks.filter((b) => b.priority < 50).length,
      };

      // 5. 构建指标记录
      const record: ContextMetricsRecord = {
        id: `metrics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tripId: metadata.tripId,
        phase: metadata.phase,
        agent: metadata.agent,
        timestamp: new Date().toISOString(),
        tokens,
        blocks,
        quality,
        performance: {
          buildTimeMs: metadata.buildTimeMs,
          cacheHit: metadata.cacheHit,
          skillsCalled: metadata.skillsCalled,
        },
        blockTypeDistribution,
        priorityDistribution,
      };

      // 6. 存储指标（内存 + 可选数据库）
      this.storeMetrics(record);

      this.logger.debug(
        `记录 Context Package 指标: tripId=${metadata.tripId || 'none'}, phase=${metadata.phase}, quality=${quality.quality}`,
      );

      return record;
    } catch (error: any) {
      this.logger.error(`记录指标失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 存储指标
   */
  private async storeMetrics(record: ContextMetricsRecord): Promise<void> {
    // 1. 存入内存
    const key = record.tripId || 'global';
    if (!this.metricsStore.has(key)) {
      this.metricsStore.set(key, []);
    }
    this.metricsStore.get(key)!.push(record);

    // 2. 限制内存存储大小（每个 key 最多保留 100 条）
    const records = this.metricsStore.get(key)!;
    if (records.length > 100) {
      records.shift(); // 移除最旧的记录
    }
  }

  /**
   * 获取指标摘要
   */
  async getMetricsSummary(
    options: {
      tripId?: string;
      phase?: string;
      agent?: string;
      startTime?: string;
      endTime?: string;
    },
  ): Promise<ContextMetricsSummary> {
    // 1. 获取相关记录
    const key = options.tripId || 'global';
    let records = this.metricsStore.get(key) || [];

    // 2. 过滤记录
    if (options.phase) {
      records = records.filter((r) => r.phase === options.phase);
    }
    if (options.agent) {
      records = records.filter((r) => r.agent === options.agent);
    }
    if (options.startTime) {
      records = records.filter((r) => r.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      records = records.filter((r) => r.timestamp <= options.endTime!);
    }

    if (records.length === 0) {
      return {
        timeRange: {
          start: options.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          end: options.endTime || new Date().toISOString(),
        },
        totalRecords: 0,
        avgTokens: 0,
        avgCompressionRate: 0,
        avgNoiseRate: 0,
        cacheHitRate: 0,
        avgBuildTimeMs: 0,
        qualityDistribution: {
          EXCELLENT: 0,
          GOOD: 0,
          FAIR: 0,
          POOR: 0,
        },
        topBlockTypes: [],
      };
    }

    // 3. 计算聚合指标
    const totalRecords = records.length;
    const avgTokens = records.reduce((sum, r) => sum + r.tokens.total, 0) / totalRecords;
    const avgCompressionRate =
      records
        .filter((r) => r.blocks.compressionRate !== undefined)
        .reduce((sum, r) => sum + (r.blocks.compressionRate || 0), 0) /
      records.filter((r) => r.blocks.compressionRate !== undefined).length || 0;
    const avgHitRate =
      records
        .filter((r) => r.quality.hitRate !== undefined)
        .reduce((sum, r) => sum + (r.quality.hitRate || 0), 0) /
      records.filter((r) => r.quality.hitRate !== undefined).length;
    const avgNoiseRate = records.reduce((sum, r) => sum + r.quality.noiseRate, 0) / totalRecords;
    const cacheHitRate =
      records.filter((r) => r.performance.cacheHit).length / totalRecords;
    const avgBuildTimeMs = records.reduce((sum, r) => sum + r.performance.buildTimeMs, 0) / totalRecords;

    // 4. 计算质量分布
    const qualityDistribution = {
      EXCELLENT: records.filter((r) => r.quality.quality === 'EXCELLENT').length,
      GOOD: records.filter((r) => r.quality.quality === 'GOOD').length,
      FAIR: records.filter((r) => r.quality.quality === 'FAIR').length,
      POOR: records.filter((r) => r.quality.quality === 'POOR').length,
    };

    // 5. 计算最常用的块类型
    const blockTypeCounts: Record<string, number> = {};
    for (const record of records) {
      for (const [type, count] of Object.entries(record.blockTypeDistribution)) {
        blockTypeCounts[type] = (blockTypeCounts[type] || 0) + count;
      }
    }

    const topBlockTypes = Object.entries(blockTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    // 6. 计算时间范围
    const timestamps = records.map((r) => new Date(r.timestamp).getTime());
    const startTime = new Date(Math.min(...timestamps)).toISOString();
    const endTime = new Date(Math.max(...timestamps)).toISOString();

    return {
      timeRange: {
        start: startTime,
        end: endTime,
      },
      totalRecords,
      avgTokens: Math.round(avgTokens),
      avgCompressionRate: Math.round(avgCompressionRate * 100) / 100,
      avgHitRate: avgHitRate ? Math.round(avgHitRate * 100) / 100 : undefined,
      avgNoiseRate: Math.round(avgNoiseRate * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      avgBuildTimeMs: Math.round(avgBuildTimeMs),
      qualityDistribution,
      topBlockTypes,
    };
  }

  /**
   * 获取最近的指标记录
   */
  getRecentMetrics(
    tripId?: string,
    limit: number = 10,
  ): ContextMetricsRecord[] {
    const key = tripId || 'global';
    const records = this.metricsStore.get(key) || [];
    return records
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
}