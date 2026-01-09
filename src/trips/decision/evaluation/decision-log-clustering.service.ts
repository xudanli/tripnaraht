// src/trips/decision/evaluation/decision-log-clustering.service.ts
/**
 * Decision Log Clustering Service
 * 
 * 决策日志聚类分析服务
 * 
 * 功能：
 * 1. 分析最常见的拒绝原因
 * 2. 分析最常见的替换原因
 * 3. 按 decisionStage 和 decisionSource 聚类
 * 4. 生成决策质量报告
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { DecisionLogEntry, DecisionSource, DecisionStage } from '../shared/decision-result.types';

/**
 * 拒绝原因聚类结果
 */
export interface RejectionCluster {
  /** 原因代码 */
  reasonCode: string;
  /** 出现次数 */
  count: number;
  /** 占比（0-1） */
  percentage: number;
  /** 关联的 decisionSource */
  decisionSources: {
    source: DecisionSource;
    count: number;
  }[];
  /** 关联的 decisionStage */
  decisionStages: {
    stage: DecisionStage;
    count: number;
  }[];
  /** 示例日志（最近 3 条） */
  examples: DecisionLogEntry[];
}

/**
 * 替换原因聚类结果
 */
export interface ReplacementCluster {
  /** 替换类型 */
  replacementType: string;
  /** 出现次数 */
  count: number;
  /** 占比（0-1） */
  percentage: number;
  /** 关联的 reasonCodes */
  reasonCodes: {
    code: string;
    count: number;
  }[];
  /** 示例日志（最近 3 条） */
  examples: DecisionLogEntry[];
}

/**
 * 决策质量报告
 */
export interface DecisionQualityReport {
  /** 分析时间范围 */
  timeRange: {
    start: Date;
    end: Date;
  };
  /** 总日志数 */
  totalLogs: number;
  /** 拒绝原因聚类（Top 10） */
  topRejectionReasons: RejectionCluster[];
  /** 替换原因聚类（Top 10） */
  topReplacementReasons: ReplacementCluster[];
  /** 按 decisionStage 统计 */
  byStage: {
    stage: DecisionStage;
    count: number;
    rejectionCount: number;
    replacementCount: number;
  }[];
  /** 按 decisionSource 统计 */
  bySource: {
    source: DecisionSource;
    count: number;
    rejectionCount: number;
    replacementCount: number;
  }[];
  /** 按 persona 统计 */
  byPersona: {
    persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    count: number;
    rejectionCount: number;
    replacementCount: number;
  }[];
  /** 质量指标 */
  qualityMetrics: {
    /** 拒绝率 */
    rejectionRate: number;
    /** 替换率 */
    replacementRate: number;
    /** 硬现实驱动比例（PHYSICAL + HUMAN） */
    realityDrivenRatio: number;
    /** 平均每个 trip 的决策数 */
    avgDecisionsPerTrip: number;
  };
}

@Injectable()
export class DecisionLogClusteringService {
  private readonly logger = new Logger(DecisionLogClusteringService.name);

  constructor(
    private readonly logStorage: DecisionLogStorageService,
  ) {}

  /**
   * 分析最常见的拒绝原因
   */
  async analyzeRejectionReasons(filters: {
    countryCode?: string;
    routeDirectionId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<RejectionCluster[]> {
    this.logger.debug('分析最常见的拒绝原因');

    // 1. 查询所有 REJECT 日志
    const logs = await this.logStorage.queryLogs({
      ...filters,
      limit: filters.limit || 10000,
    });

    const rejectionLogs = logs.filter(log => log.action === 'REJECT');

    if (rejectionLogs.length === 0) {
      return [];
    }

    // 2. 按 reasonCode 聚类
    const clusters = new Map<string, {
      logs: DecisionLogEntry[];
      sources: Map<DecisionSource, number>;
      stages: Map<DecisionStage, number>;
    }>();

    for (const log of rejectionLogs) {
      for (const reasonCode of log.reasonCodes) {
        if (!clusters.has(reasonCode)) {
          clusters.set(reasonCode, {
            logs: [],
            sources: new Map(),
            stages: new Map(),
          });
        }

        const cluster = clusters.get(reasonCode)!;
        cluster.logs.push(log);

        // 统计 decisionSource
        const sourceCount = cluster.sources.get(log.decisionSource) || 0;
        cluster.sources.set(log.decisionSource, sourceCount + 1);

        // 统计 decisionStage
        const stageCount = cluster.stages.get(log.decisionStage) || 0;
        cluster.stages.set(log.decisionStage, stageCount + 1);
      }
    }

    // 3. 转换为结果格式
    const totalRejections = rejectionLogs.length;
    const results: RejectionCluster[] = [];

    for (const [reasonCode, cluster] of clusters.entries()) {
      // 按时间排序，取最近 3 条作为示例
      const examples = cluster.logs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 3);

      results.push({
        reasonCode,
        count: cluster.logs.length,
        percentage: cluster.logs.length / totalRejections,
        decisionSources: Array.from(cluster.sources.entries()).map(([source, count]) => ({
          source,
          count,
        })),
        decisionStages: Array.from(cluster.stages.entries()).map(([stage, count]) => ({
          stage,
          count,
        })),
        examples,
      });
    }

    // 4. 按出现次数排序
    results.sort((a, b) => b.count - a.count);

    return results;
  }

  /**
   * 分析最常见的替换原因
   */
  async analyzeReplacementReasons(filters: {
    countryCode?: string;
    routeDirectionId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<ReplacementCluster[]> {
    this.logger.debug('分析最常见的替换原因');

    // 1. 查询所有 REPLACE 日志
    const logs = await this.logStorage.queryLogs({
      ...filters,
      limit: filters.limit || 10000,
    });

    const replacementLogs = logs.filter(log => log.action === 'REPLACE');

    if (replacementLogs.length === 0) {
      return [];
    }

    // 2. 按替换类型聚类（从 reasonCodes 中提取）
    const clusters = new Map<string, {
      logs: DecisionLogEntry[];
      reasonCodes: Map<string, number>;
    }>();

    for (const log of replacementLogs) {
      // 提取替换类型（如 'SPATIAL_REPLACEMENT', 'ENTRY', 'POI', 'SEGMENT'）
      const replacementTypes = log.reasonCodes.filter(code =>
        code.includes('REPLACEMENT') ||
        code.includes('ENTRY') ||
        code.includes('POI') ||
        code.includes('SEGMENT') ||
        code === 'SPATIAL_REPLACEMENT'
      );

      // 如果没有明确的替换类型，使用第一个 reasonCode
      const type = replacementTypes.length > 0
        ? replacementTypes[0]
        : log.reasonCodes[0] || 'UNKNOWN';

      if (!clusters.has(type)) {
        clusters.set(type, {
          logs: [],
          reasonCodes: new Map(),
        });
      }

      const cluster = clusters.get(type)!;
      cluster.logs.push(log);

      // 统计所有 reasonCodes
      for (const code of log.reasonCodes) {
        const count = cluster.reasonCodes.get(code) || 0;
        cluster.reasonCodes.set(code, count + 1);
      }
    }

    // 3. 转换为结果格式
    const totalReplacements = replacementLogs.length;
    const results: ReplacementCluster[] = [];

    for (const [replacementType, cluster] of clusters.entries()) {
      // 按时间排序，取最近 3 条作为示例
      const examples = cluster.logs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 3);

      results.push({
        replacementType,
        count: cluster.logs.length,
        percentage: cluster.logs.length / totalReplacements,
        reasonCodes: Array.from(cluster.reasonCodes.entries())
          .map(([code, count]) => ({ code, count }))
          .sort((a, b) => b.count - a.count),
        examples,
      });
    }

    // 4. 按出现次数排序
    results.sort((a, b) => b.count - a.count);

    return results;
  }

  /**
   * 生成决策质量报告
   */
  async generateQualityReport(filters: {
    countryCode?: string;
    routeDirectionId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<DecisionQualityReport> {
    this.logger.debug('生成决策质量报告');

    const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 默认最近 30 天
    const endDate = filters.endDate || new Date();

    // 1. 查询所有日志
    const logs = await this.logStorage.queryLogs({
      ...filters,
      startDate,
      endDate,
      limit: 10000,
    });

    if (logs.length === 0) {
      return {
        timeRange: { start: startDate, end: endDate },
        totalLogs: 0,
        topRejectionReasons: [],
        topReplacementReasons: [],
        byStage: [],
        bySource: [],
        byPersona: [],
        qualityMetrics: {
          rejectionRate: 0,
          replacementRate: 0,
          realityDrivenRatio: 0,
          avgDecisionsPerTrip: 0,
        },
      };
    }

    // 2. 分析拒绝原因（Top 10）
    const rejectionReasons = await this.analyzeRejectionReasons({
      ...filters,
      startDate,
      endDate,
    });
    const topRejectionReasons = rejectionReasons.slice(0, 10);

    // 3. 分析替换原因（Top 10）
    const replacementReasons = await this.analyzeReplacementReasons({
      ...filters,
      startDate,
      endDate,
    });
    const topReplacementReasons = replacementReasons.slice(0, 10);

    // 4. 按 decisionStage 统计
    const byStageMap = new Map<DecisionStage, {
      count: number;
      rejectionCount: number;
      replacementCount: number;
    }>();

    for (const log of logs) {
      const stage = log.decisionStage;
      if (!byStageMap.has(stage)) {
        byStageMap.set(stage, { count: 0, rejectionCount: 0, replacementCount: 0 });
      }

      const stats = byStageMap.get(stage)!;
      stats.count++;
      if (log.action === 'REJECT') stats.rejectionCount++;
      if (log.action === 'REPLACE') stats.replacementCount++;
    }

    const byStage = Array.from(byStageMap.entries()).map(([stage, stats]) => ({
      stage,
      ...stats,
    }));

    // 5. 按 decisionSource 统计
    const bySourceMap = new Map<DecisionSource, {
      count: number;
      rejectionCount: number;
      replacementCount: number;
    }>();

    for (const log of logs) {
      const source = log.decisionSource;
      if (!bySourceMap.has(source)) {
        bySourceMap.set(source, { count: 0, rejectionCount: 0, replacementCount: 0 });
      }

      const stats = bySourceMap.get(source)!;
      stats.count++;
      if (log.action === 'REJECT') stats.rejectionCount++;
      if (log.action === 'REPLACE') stats.replacementCount++;
    }

    const bySource = Array.from(bySourceMap.entries()).map(([source, stats]) => ({
      source,
      ...stats,
    }));

    // 6. 按 persona 统计
    const byPersonaMap = new Map<'ABU' | 'DR_DRE' | 'NEPTUNE', {
      count: number;
      rejectionCount: number;
      replacementCount: number;
    }>();

    for (const log of logs) {
      const persona = log.persona;
      if (!byPersonaMap.has(persona)) {
        byPersonaMap.set(persona, { count: 0, rejectionCount: 0, replacementCount: 0 });
      }

      const stats = byPersonaMap.get(persona)!;
      stats.count++;
      if (log.action === 'REJECT') stats.rejectionCount++;
      if (log.action === 'REPLACE') stats.replacementCount++;
    }

    const byPersona = Array.from(byPersonaMap.entries()).map(([persona, stats]) => ({
      persona,
      ...stats,
    }));

    // 7. 计算质量指标
    const rejectionCount = logs.filter(log => log.action === 'REJECT').length;
    const replacementCount = logs.filter(log => log.action === 'REPLACE').length;
    const realityDrivenCount = logs.filter(log =>
      log.decisionSource === 'PHYSICAL' || log.decisionSource === 'HUMAN'
    ).length;

    // 计算平均每个 trip 的决策数（需要从日志中提取 tripId）
    const tripIds = new Set(logs.map(log => (log as any).tripId).filter(Boolean));
    const avgDecisionsPerTrip = tripIds.size > 0 ? logs.length / tripIds.size : 0;

    const qualityMetrics = {
      rejectionRate: logs.length > 0 ? rejectionCount / logs.length : 0,
      replacementRate: logs.length > 0 ? replacementCount / logs.length : 0,
      realityDrivenRatio: logs.length > 0 ? realityDrivenCount / logs.length : 0,
      avgDecisionsPerTrip,
    };

    return {
      timeRange: { start: startDate, end: endDate },
      totalLogs: logs.length,
      topRejectionReasons,
      topReplacementReasons,
      byStage,
      bySource,
      byPersona,
      qualityMetrics,
    };
  }
}
