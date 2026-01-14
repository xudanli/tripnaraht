// src/itinerary-optimization/services/metrics-aggregator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { OptimizationResult } from '../interfaces/plan-request.interface';

/**
 * 路线优化评估指标
 */
export interface RouteOptimizationMetrics {
  // 可执行成功率
  executability: {
    success_rate: number; // 0-1
    rejection_rate: number; // 0-1
    rejection_reasons: Record<string, number>; // 原因 -> 次数
    total_attempts: number;
    successful_attempts: number;
    rejected_attempts: number;
  };

  // 拒绝合理率
  rejection_quality: {
    reasonable_rate: number; // 0-1（人工标注或规则判定）
    false_positive_rate: number; // 0-1（误拒绝率）
    false_negative_rate: number; // 0-1（误接受率）
    total_rejections: number;
    reasonable_rejections: number;
    false_positives: number;
    false_negatives: number;
  };

  // 替代接受率
  alternative_acceptance: {
    proposed_count: number;
    accepted_count: number;
    acceptance_rate: number; // 0-1
    avg_improvement: number; // 平均改善幅度（百分比）
    improvement_distribution: {
      min: number;
      max: number;
      median: number;
      p75: number;
      p90: number;
    };
  };

  // 偏差率
  deviation: {
    avg_plan_change_ratio: number; // 0-1（计划变化比例）
    avg_time_deviation_min: number; // 分钟（时间偏差）
    avg_cost_deviation_pct: number; // 百分比（成本偏差）
    max_time_deviation_min: number;
    max_cost_deviation_pct: number;
  };

  // 数据质量
  data_quality: {
    missing_data_rate: number; // 0-1（缺失数据比例）
    stale_data_rate: number; // 0-1（过期数据比例）
    low_reliability_rate: number; // 0-1（低可靠性数据比例）
    data_sources: Record<string, {
      count: number;
      missing: number;
      stale: number;
      low_reliability: number;
    }>;
  };

  // 性能指标
  performance: {
    avg_solve_time_ms: number;
    avg_solve_time_p50_ms: number;
    avg_solve_time_p90_ms: number;
    avg_solve_time_p99_ms: number;
    max_solve_time_ms: number;
  };
}

/**
 * 单次执行记录
 */
export interface ExecutionRecord {
  request_id: string;
  timestamp: string;
  status: 'SUCCESS' | 'REJECTED' | 'FAILED';
  rejection_reason?: string;
  rejection_quality?: 'REASONABLE' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE';
  optimization_result?: OptimizationResult;
  alternatives_proposed?: number;
  alternatives_accepted?: number;
  improvement_pct?: number;
  plan_change_ratio?: number;
  time_deviation_min?: number;
  cost_deviation_pct?: number;
  data_quality?: {
    missing: string[];
    stale: string[];
    low_reliability: string[];
  };
  solve_time_ms?: number;
}

/**
 * 统一评估指标聚合服务
 * 
 * 功能：
 * 1. 聚合单次执行记录
 * 2. 计算评估指标
 * 3. 生成评估报告
 * 4. 支持时间窗口查询
 */
@Injectable()
export class MetricsAggregatorService {
  private readonly logger = new Logger(MetricsAggregatorService.name);
  
  // 内存存储（生产环境应该使用数据库）
  private executionRecords: ExecutionRecord[] = [];

  /**
   * 记录执行结果
   */
  recordExecution(record: ExecutionRecord): void {
    this.executionRecords.push(record);
    this.logger.debug(`记录执行结果: ${record.request_id}, status=${record.status}`);
  }

  /**
   * 批量记录执行结果
   */
  recordExecutions(records: ExecutionRecord[]): void {
    this.executionRecords.push(...records);
    this.logger.debug(`批量记录 ${records.length} 条执行结果`);
  }

  /**
   * 聚合评估指标
   */
  aggregateMetrics(options: {
    start_time?: string; // ISO 8601
    end_time?: string; // ISO 8601
    filter?: (record: ExecutionRecord) => boolean;
  } = {}): RouteOptimizationMetrics {
    let records = [...this.executionRecords];

    // 时间过滤
    if (options.start_time) {
      records = records.filter(r => r.timestamp >= options.start_time!);
    }
    if (options.end_time) {
      records = records.filter(r => r.timestamp <= options.end_time!);
    }

    // 自定义过滤
    if (options.filter) {
      records = records.filter(options.filter);
    }

    if (records.length === 0) {
      return this.createEmptyMetrics();
    }

    // 计算可执行成功率
    const executability = this.calculateExecutability(records);

    // 计算拒绝合理率
    const rejectionQuality = this.calculateRejectionQuality(records);

    // 计算替代接受率
    const alternativeAcceptance = this.calculateAlternativeAcceptance(records);

    // 计算偏差率
    const deviation = this.calculateDeviation(records);

    // 计算数据质量
    const dataQuality = this.calculateDataQuality(records);

    // 计算性能指标
    const performance = this.calculatePerformance(records);

    return {
      executability,
      rejection_quality: rejectionQuality,
      alternative_acceptance: alternativeAcceptance,
      deviation,
      data_quality: dataQuality,
      performance,
    };
  }

  /**
   * 计算可执行成功率
   */
  private calculateExecutability(records: ExecutionRecord[]): RouteOptimizationMetrics['executability'] {
    const total = records.length;
    const successful = records.filter(r => r.status === 'SUCCESS').length;
    const rejected = records.filter(r => r.status === 'REJECTED').length;

    // 统计拒绝原因
    const rejectionReasons: Record<string, number> = {};
    records
      .filter(r => r.status === 'REJECTED' && r.rejection_reason)
      .forEach(r => {
        const reason = r.rejection_reason!;
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      });

    return {
      success_rate: total > 0 ? successful / total : 0,
      rejection_rate: total > 0 ? rejected / total : 0,
      rejection_reasons: rejectionReasons,
      total_attempts: total,
      successful_attempts: successful,
      rejected_attempts: rejected,
    };
  }

  /**
   * 计算拒绝合理率
   */
  private calculateRejectionQuality(records: ExecutionRecord[]): RouteOptimizationMetrics['rejection_quality'] {
    const rejections = records.filter(r => r.status === 'REJECTED');
    const total = rejections.length;

    if (total === 0) {
      return {
        reasonable_rate: 1.0,
        false_positive_rate: 0,
        false_negative_rate: 0,
        total_rejections: 0,
        reasonable_rejections: 0,
        false_positives: 0,
        false_negatives: 0,
      };
    }

    const reasonable = rejections.filter(r => r.rejection_quality === 'REASONABLE').length;
    const falsePositives = rejections.filter(r => r.rejection_quality === 'FALSE_POSITIVE').length;
    const falseNegatives = records.filter(r => r.status === 'SUCCESS' && r.rejection_quality === 'FALSE_NEGATIVE').length;

    return {
      reasonable_rate: total > 0 ? reasonable / total : 0,
      false_positive_rate: total > 0 ? falsePositives / total : 0,
      false_negative_rate: records.length > 0 ? falseNegatives / records.length : 0,
      total_rejections: total,
      reasonable_rejections: reasonable,
      false_positives: falsePositives,
      false_negatives: falseNegatives,
    };
  }

  /**
   * 计算替代接受率
   */
  private calculateAlternativeAcceptance(records: ExecutionRecord[]): RouteOptimizationMetrics['alternative_acceptance'] {
    const withAlternatives = records.filter(r => r.alternatives_proposed !== undefined && r.alternatives_proposed > 0);
    
    if (withAlternatives.length === 0) {
      return {
        proposed_count: 0,
        accepted_count: 0,
        acceptance_rate: 0,
        avg_improvement: 0,
        improvement_distribution: {
          min: 0,
          max: 0,
          median: 0,
          p75: 0,
          p90: 0,
        },
      };
    }

    const proposedCount = withAlternatives.reduce((sum, r) => sum + (r.alternatives_proposed || 0), 0);
    const acceptedCount = withAlternatives.reduce((sum, r) => sum + (r.alternatives_accepted || 0), 0);
    
    const improvements = withAlternatives
      .filter(r => r.improvement_pct !== undefined)
      .map(r => r.improvement_pct!)
      .sort((a, b) => a - b);

    const avgImprovement = improvements.length > 0
      ? improvements.reduce((sum, v) => sum + v, 0) / improvements.length
      : 0;

    const getPercentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const index = Math.floor(arr.length * p);
      return arr[Math.min(index, arr.length - 1)];
    };

    return {
      proposed_count: proposedCount,
      accepted_count: acceptedCount,
      acceptance_rate: proposedCount > 0 ? acceptedCount / proposedCount : 0,
      avg_improvement: avgImprovement,
      improvement_distribution: {
        min: improvements.length > 0 ? improvements[0] : 0,
        max: improvements.length > 0 ? improvements[improvements.length - 1] : 0,
        median: getPercentile(improvements, 0.5),
        p75: getPercentile(improvements, 0.75),
        p90: getPercentile(improvements, 0.9),
      },
    };
  }

  /**
   * 计算偏差率
   */
  private calculateDeviation(records: ExecutionRecord[]): RouteOptimizationMetrics['deviation'] {
    const withDeviations = records.filter(
      r => r.plan_change_ratio !== undefined || r.time_deviation_min !== undefined || r.cost_deviation_pct !== undefined
    );

    if (withDeviations.length === 0) {
      return {
        avg_plan_change_ratio: 0,
        avg_time_deviation_min: 0,
        avg_cost_deviation_pct: 0,
        max_time_deviation_min: 0,
        max_cost_deviation_pct: 0,
      };
    }

    const planChanges = withDeviations
      .filter(r => r.plan_change_ratio !== undefined)
      .map(r => r.plan_change_ratio!);
    const timeDeviations = withDeviations
      .filter(r => r.time_deviation_min !== undefined)
      .map(r => Math.abs(r.time_deviation_min!));
    const costDeviations = withDeviations
      .filter(r => r.cost_deviation_pct !== undefined)
      .map(r => Math.abs(r.cost_deviation_pct!));

    return {
      avg_plan_change_ratio: planChanges.length > 0
        ? planChanges.reduce((sum, v) => sum + v, 0) / planChanges.length
        : 0,
      avg_time_deviation_min: timeDeviations.length > 0
        ? timeDeviations.reduce((sum, v) => sum + v, 0) / timeDeviations.length
        : 0,
      avg_cost_deviation_pct: costDeviations.length > 0
        ? costDeviations.reduce((sum, v) => sum + v, 0) / costDeviations.length
        : 0,
      max_time_deviation_min: timeDeviations.length > 0 ? Math.max(...timeDeviations) : 0,
      max_cost_deviation_pct: costDeviations.length > 0 ? Math.max(...costDeviations) : 0,
    };
  }

  /**
   * 计算数据质量
   */
  private calculateDataQuality(records: ExecutionRecord[]): RouteOptimizationMetrics['data_quality'] {
    const withDataQuality = records.filter(r => r.data_quality !== undefined);
    
    if (withDataQuality.length === 0) {
      return {
        missing_data_rate: 0,
        stale_data_rate: 0,
        low_reliability_rate: 0,
        data_sources: {},
      };
    }

    let totalMissing = 0;
    let totalStale = 0;
    let totalLowReliability = 0;
    const dataSources: Record<string, {
      count: number;
      missing: number;
      stale: number;
      low_reliability: number;
    }> = {};

    withDataQuality.forEach(r => {
      const dq = r.data_quality!;
      totalMissing += dq.missing.length;
      totalStale += dq.stale.length;
      totalLowReliability += dq.low_reliability.length;

      // 统计各数据源
      [...dq.missing, ...dq.stale, ...dq.low_reliability].forEach(source => {
        if (!dataSources[source]) {
          dataSources[source] = { count: 0, missing: 0, stale: 0, low_reliability: 0 };
        }
        dataSources[source].count++;
        
        if (dq.missing.includes(source)) dataSources[source].missing++;
        if (dq.stale.includes(source)) dataSources[source].stale++;
        if (dq.low_reliability.includes(source)) dataSources[source].low_reliability++;
      });
    });

    const totalDataPoints = withDataQuality.length * 5; // 假设每个请求有 5 个数据源

    return {
      missing_data_rate: totalDataPoints > 0 ? totalMissing / totalDataPoints : 0,
      stale_data_rate: totalDataPoints > 0 ? totalStale / totalDataPoints : 0,
      low_reliability_rate: totalDataPoints > 0 ? totalLowReliability / totalDataPoints : 0,
      data_sources: dataSources,
    };
  }

  /**
   * 计算性能指标
   */
  private calculatePerformance(records: ExecutionRecord[]): RouteOptimizationMetrics['performance'] {
    const withSolveTime = records
      .filter(r => r.solve_time_ms !== undefined)
      .map(r => r.solve_time_ms!)
      .sort((a, b) => a - b);

    if (withSolveTime.length === 0) {
      return {
        avg_solve_time_ms: 0,
        avg_solve_time_p50_ms: 0,
        avg_solve_time_p90_ms: 0,
        avg_solve_time_p99_ms: 0,
        max_solve_time_ms: 0,
      };
    }

    const getPercentile = (arr: number[], p: number): number => {
      const index = Math.floor(arr.length * p);
      return arr[Math.min(index, arr.length - 1)];
    };

    return {
      avg_solve_time_ms: withSolveTime.reduce((sum, v) => sum + v, 0) / withSolveTime.length,
      avg_solve_time_p50_ms: getPercentile(withSolveTime, 0.5),
      avg_solve_time_p90_ms: getPercentile(withSolveTime, 0.9),
      avg_solve_time_p99_ms: getPercentile(withSolveTime, 0.99),
      max_solve_time_ms: withSolveTime[withSolveTime.length - 1],
    };
  }

  /**
   * 创建空指标
   */
  private createEmptyMetrics(): RouteOptimizationMetrics {
    return {
      executability: {
        success_rate: 0,
        rejection_rate: 0,
        rejection_reasons: {},
        total_attempts: 0,
        successful_attempts: 0,
        rejected_attempts: 0,
      },
      rejection_quality: {
        reasonable_rate: 0,
        false_positive_rate: 0,
        false_negative_rate: 0,
        total_rejections: 0,
        reasonable_rejections: 0,
        false_positives: 0,
        false_negatives: 0,
      },
      alternative_acceptance: {
        proposed_count: 0,
        accepted_count: 0,
        acceptance_rate: 0,
        avg_improvement: 0,
        improvement_distribution: {
          min: 0,
          max: 0,
          median: 0,
          p75: 0,
          p90: 0,
        },
      },
      deviation: {
        avg_plan_change_ratio: 0,
        avg_time_deviation_min: 0,
        avg_cost_deviation_pct: 0,
        max_time_deviation_min: 0,
        max_cost_deviation_pct: 0,
      },
      data_quality: {
        missing_data_rate: 0,
        stale_data_rate: 0,
        low_reliability_rate: 0,
        data_sources: {},
      },
      performance: {
        avg_solve_time_ms: 0,
        avg_solve_time_p50_ms: 0,
        avg_solve_time_p90_ms: 0,
        avg_solve_time_p99_ms: 0,
        max_solve_time_ms: 0,
      },
    };
  }

  /**
   * 获取执行记录（用于调试）
   */
  getExecutionRecords(options: {
    start_time?: string;
    end_time?: string;
    limit?: number;
  } = {}): ExecutionRecord[] {
    let records = [...this.executionRecords];

    if (options.start_time) {
      records = records.filter(r => r.timestamp >= options.start_time!);
    }
    if (options.end_time) {
      records = records.filter(r => r.timestamp <= options.end_time!);
    }

    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (options.limit) {
      records = records.slice(0, options.limit);
    }

    return records;
  }

  /**
   * 清空记录（用于测试）
   */
  clearRecords(): void {
    this.executionRecords = [];
    this.logger.debug('已清空所有执行记录');
  }
}
