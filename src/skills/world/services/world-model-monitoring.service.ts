/**
 * 世界模型监控服务
 * 
 * Code Review P2-4修复：添加性能指标和错误率监控
 * 
 * 职责：
 * - 记录世界模型构建性能指标
 * - 记录错误率和失败率
 * - 提供性能统计和报告
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * 性能指标
 */
export interface WorldModelPerformanceMetrics {
  /** 构建时间统计（毫秒） */
  buildTime: {
    count: number;
    total: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  
  /** 错误统计 */
  errors: {
    total: number;
    byType: Map<string, number>;
    rate: number; // 错误率（0-1）
  };
  
  /** 缓存命中率 */
  cacheHitRate: {
    causalReasoning: number; // 0-1
    versionComparison: number; // 0-1
  };
  
  /** 请求统计 */
  requests: {
    total: number;
    successful: number;
    failed: number;
    byCountry: Map<string, number>;
  };
}

@Injectable()
export class WorldModelMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(WorldModelMonitoringService.name);
  
  /** 构建时间记录 */
  private readonly buildTimes: number[] = [];
  
  /** 错误记录 */
  private readonly errors: Array<{ type: string; timestamp: Date; message: string }> = [];
  
  /** 请求记录 */
  private readonly requests: Array<{ success: boolean; countryCode?: string; timestamp: Date }> = [];
  
  /** 缓存命中记录 */
  private readonly cacheHits = {
    causalReasoning: { hits: 0, misses: 0 },
    versionComparison: { hits: 0, misses: 0 },
  };
  
  /** 最大记录数（避免内存泄漏） */
  private readonly maxRecords = 10000;

  onModuleInit() {
    this.logger.log('世界模型监控服务已初始化');
  }

  /**
   * 记录世界模型构建
   */
  recordBuild(buildTimeMs: number, countryCode?: string): void {
    // 记录构建时间
    this.buildTimes.push(buildTimeMs);
    if (this.buildTimes.length > this.maxRecords) {
      this.buildTimes.shift();
    }

    // 记录请求
    this.requests.push({
      success: true,
      countryCode,
      timestamp: new Date(),
    });
    if (this.requests.length > this.maxRecords) {
      this.requests.shift();
    }

    this.logger.debug(
      `[WorldModelMonitoring] 记录构建: buildTimeMs=${buildTimeMs}, countryCode=${countryCode || 'N/A'}`,
    );
  }

  /**
   * 记录构建错误
   */
  recordError(errorType: string, message: string, countryCode?: string): void {
    // 记录错误
    this.errors.push({
      type: errorType,
      timestamp: new Date(),
      message,
    });
    if (this.errors.length > this.maxRecords) {
      this.errors.shift();
    }

    // 记录失败的请求
    this.requests.push({
      success: false,
      countryCode,
      timestamp: new Date(),
    });
    if (this.requests.length > this.maxRecords) {
      this.requests.shift();
    }

    this.logger.warn(
      `[WorldModelMonitoring] 记录错误: type=${errorType}, message=${message}`,
    );
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit(cacheType: 'causalReasoning' | 'versionComparison'): void {
    this.cacheHits[cacheType].hits++;
    this.logger.debug(`[WorldModelMonitoring] 缓存命中: type=${cacheType}`);
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss(cacheType: 'causalReasoning' | 'versionComparison'): void {
    this.cacheHits[cacheType].misses++;
    this.logger.debug(`[WorldModelMonitoring] 缓存未命中: type=${cacheType}`);
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): WorldModelPerformanceMetrics {
    // 计算构建时间统计
    const buildTimeStats = this.calculateBuildTimeStats();
    
    // 计算错误统计
    const errorStats = this.calculateErrorStats();
    
    // 计算缓存命中率
    const cacheHitRate = this.calculateCacheHitRate();
    
    // 计算请求统计
    const requestStats = this.calculateRequestStats();

    return {
      buildTime: buildTimeStats,
      errors: errorStats,
      cacheHitRate,
      requests: requestStats,
    };
  }

  /**
   * 计算构建时间统计
   */
  private calculateBuildTimeStats(): WorldModelPerformanceMetrics['buildTime'] {
    if (this.buildTimes.length === 0) {
      return {
        count: 0,
        total: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...this.buildTimes].sort((a, b) => a - b);
    const total = sorted.reduce((sum, time) => sum + time, 0);
    const avg = total / sorted.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = this.percentile(sorted, 50);
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);

    return {
      count: sorted.length,
      total,
      avg,
      min,
      max,
      p50,
      p95,
      p99,
    };
  }

  /**
   * 计算错误统计
   */
  private calculateErrorStats(): WorldModelPerformanceMetrics['errors'] {
    const byType = new Map<string, number>();
    for (const error of this.errors) {
      byType.set(error.type, (byType.get(error.type) || 0) + 1);
    }

    const totalRequests = this.requests.length;
    const errorRate = totalRequests > 0 ? this.errors.length / totalRequests : 0;

    return {
      total: this.errors.length,
      byType,
      rate: errorRate,
    };
  }

  /**
   * 计算缓存命中率
   */
  private calculateCacheHitRate(): WorldModelPerformanceMetrics['cacheHitRate'] {
    const causalTotal = this.cacheHits.causalReasoning.hits + this.cacheHits.causalReasoning.misses;
    const versionTotal = this.cacheHits.versionComparison.hits + this.cacheHits.versionComparison.misses;

    return {
      causalReasoning: causalTotal > 0
        ? this.cacheHits.causalReasoning.hits / causalTotal
        : 0,
      versionComparison: versionTotal > 0
        ? this.cacheHits.versionComparison.hits / versionTotal
        : 0,
    };
  }

  /**
   * 计算请求统计
   */
  private calculateRequestStats(): WorldModelPerformanceMetrics['requests'] {
    const successful = this.requests.filter((r) => r.success).length;
    const failed = this.requests.filter((r) => !r.success).length;
    
    const byCountry = new Map<string, number>();
    for (const request of this.requests) {
      if (request.countryCode) {
        byCountry.set(
          request.countryCode,
          (byCountry.get(request.countryCode) || 0) + 1,
        );
      }
    }

    return {
      total: this.requests.length,
      successful,
      failed,
      byCountry,
    };
  }

  /**
   * 计算百分位数
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * 重置指标（用于测试）
   */
  reset(): void {
    this.buildTimes.length = 0;
    this.errors.length = 0;
    this.requests.length = 0;
    this.cacheHits.causalReasoning = { hits: 0, misses: 0 };
    this.cacheHits.versionComparison = { hits: 0, misses: 0 };
    this.logger.log('[WorldModelMonitoring] 指标已重置');
  }
}
