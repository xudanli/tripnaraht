/**
 * PostgreSQL MCP Monitoring Service
 * 
 * 提供查询性能监控和日志记录功能
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface QueryMetrics {
  query: string;
  params?: any[];
  executionTime: number; // 毫秒
  timestamp: Date;
  success: boolean;
  error?: string;
  rowCount?: number;
}

export interface PerformanceStats {
  totalQueries: number;
  avgExecutionTime: number;
  p50ExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
  errorRate: number;
  slowQueries: QueryMetrics[];
}

@Injectable()
export class PostgreSQLMcpMonitoringService {
  private readonly logger = new Logger(PostgreSQLMcpMonitoringService.name);
  private readonly metricsKeyPrefix = 'postgresql-mcp:metrics:';
  private readonly slowQueryThreshold = 1000; // 1秒
  private readonly maxSlowQueries = 100; // 最多保留100条慢查询

  // 内存存储（用于慢查询和统计数据）
  private readonly slowQueries: QueryMetrics[] = [];
  private readonly dailyStats: Map<string, {
    totalQueries: number;
    successQueries: number;
    failedQueries: number;
    executionTimes: number[];
  }> = new Map();

  constructor(@Optional() private readonly redisService?: RedisService) {}

  /**
   * 记录查询指标
   */
  async recordQueryMetrics(metrics: QueryMetrics): Promise<void> {
    try {
      // 1. 记录到日志
      if (metrics.success) {
        this.logger.debug(
          `Query executed: ${metrics.executionTime}ms, rows: ${metrics.rowCount || 0}`
        );
      } else {
        this.logger.warn(
          `Query failed: ${metrics.error}, executionTime: ${metrics.executionTime}ms`
        );
      }

      // 2. 记录慢查询
      if (metrics.executionTime > this.slowQueryThreshold) {
        await this.recordSlowQuery(metrics);
      }

      // 3. 记录到 Redis（如果可用）
      if (this.redisService) {
        await this.recordToRedis(metrics);
      }
    } catch (error: any) {
      this.logger.error(`Failed to record query metrics: ${error.message}`);
    }
  }

  /**
   * 记录慢查询
   */
  private async recordSlowQuery(metrics: QueryMetrics): Promise<void> {
    try {
      // 添加到内存列表（按执行时间降序）
      this.slowQueries.push(metrics);
      this.slowQueries.sort((a, b) => b.executionTime - a.executionTime);
      
      // 只保留最新的 maxSlowQueries 条
      if (this.slowQueries.length > this.maxSlowQueries) {
        this.slowQueries.splice(this.maxSlowQueries);
      }

      // 如果 Redis 可用，也存储一份（使用 JSON 序列化）
      if (this.redisService) {
        const key = `${this.metricsKeyPrefix}slow-queries`;
        const serialized = JSON.stringify(this.slowQueries.slice(0, this.maxSlowQueries));
        await this.redisService.set(key, serialized, 7 * 24 * 60 * 60); // 7天过期
      }

      // 记录到日志
      this.logger.warn(
        `Slow query detected: ${metrics.executionTime}ms\nQuery: ${metrics.query.substring(0, 200)}...`
      );
    } catch (error: any) {
      this.logger.error(`Failed to record slow query: ${error.message}`);
    }
  }

  /**
   * 记录到内存和 Redis
   */
  private async recordToRedis(metrics: QueryMetrics): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      // 更新内存统计
      if (!this.dailyStats.has(date)) {
        this.dailyStats.set(date, {
          totalQueries: 0,
          successQueries: 0,
          failedQueries: 0,
          executionTimes: [],
        });
      }

      const stats = this.dailyStats.get(date)!;
      stats.totalQueries++;
      if (metrics.success) {
        stats.successQueries++;
      } else {
        stats.failedQueries++;
      }
      stats.executionTimes.push(metrics.executionTime);
      
      // 只保留最近 10000 条执行时间记录
      if (stats.executionTimes.length > 10000) {
        stats.executionTimes = stats.executionTimes.slice(-10000);
      }

      // 如果 Redis 可用，同步到 Redis（使用 JSON 序列化）
      if (this.redisService) {
        const key = `${this.metricsKeyPrefix}daily:${date}`;
        const serialized = JSON.stringify(stats);
        await this.redisService.set(key, serialized, 30 * 24 * 60 * 60); // 30天过期
      }
    } catch (error: any) {
      this.logger.error(`Failed to record to Redis: ${error.message}`);
    }
  }

  /**
   * 获取性能统计
   */
  async getPerformanceStats(days: number = 1): Promise<PerformanceStats> {
    try {
      const stats: PerformanceStats = {
        totalQueries: 0,
        avgExecutionTime: 0,
        p50ExecutionTime: 0,
        p95ExecutionTime: 0,
        p99ExecutionTime: 0,
        errorRate: 0,
        slowQueries: [],
      };

      const executionTimes: number[] = [];
      let totalQueries = 0;
      let successQueries = 0;
      let failedQueries = 0;

      // 从内存获取最近 N 天的数据
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        let dailyStats = this.dailyStats.get(dateStr);
        
        // 如果内存中没有，尝试从 Redis 加载
        if (!dailyStats && this.redisService) {
          const key = `${this.metricsKeyPrefix}daily:${dateStr}`;
          const cached = await this.redisService.get<any>(key);
          if (cached) {
            dailyStats = cached;
            this.dailyStats.set(dateStr, dailyStats);
          }
        }

        if (dailyStats) {
          totalQueries += dailyStats.totalQueries;
          successQueries += dailyStats.successQueries;
          failedQueries += dailyStats.failedQueries;
          executionTimes.push(...dailyStats.executionTimes);
        }
      }

      // 计算统计指标
      if (executionTimes.length > 0) {
        executionTimes.sort((a, b) => a - b);
        const sum = executionTimes.reduce((a, b) => a + b, 0);
        stats.avgExecutionTime = sum / executionTimes.length;
        stats.p50ExecutionTime = this.getPercentile(executionTimes, 50);
        stats.p95ExecutionTime = this.getPercentile(executionTimes, 95);
        stats.p99ExecutionTime = this.getPercentile(executionTimes, 99);
      }

      stats.totalQueries = totalQueries;
      stats.errorRate = totalQueries > 0 ? failedQueries / totalQueries : 0;

      // 获取慢查询
      stats.slowQueries = await this.getSlowQueries();

      return stats;
    } catch (error: any) {
      this.logger.error(`Failed to get performance stats: ${error.message}`);
      return this.getDefaultStats();
    }
  }

  /**
   * 获取慢查询列表
   */
  async getSlowQueries(limit: number = 20): Promise<QueryMetrics[]> {
    try {
      // 从内存获取
      let queries = this.slowQueries.slice(0, limit);

      // 如果内存中没有，尝试从 Redis 加载
      if (queries.length === 0 && this.redisService) {
        const key = `${this.metricsKeyPrefix}slow-queries`;
        const cached = await this.redisService.get<QueryMetrics[]>(key);
        if (cached && Array.isArray(cached)) {
          queries = cached.slice(0, limit);
          // 同步到内存
          this.slowQueries.push(...cached);
          this.slowQueries.sort((a, b) => b.executionTime - a.executionTime);
          if (this.slowQueries.length > this.maxSlowQueries) {
            this.slowQueries.splice(this.maxSlowQueries);
          }
        }
      }

      // 确保时间戳是 Date 对象
      return queries.map(q => ({
        ...q,
        timestamp: q.timestamp instanceof Date ? q.timestamp : new Date(q.timestamp),
      }));
    } catch (error: any) {
      this.logger.error(`Failed to get slow queries: ${error.message}`);
      return [];
    }
  }

  /**
   * 计算百分位数
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) {
      return 0;
    }

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * 获取默认统计（当 Redis 不可用时）
   */
  private getDefaultStats(): PerformanceStats {
    return {
      totalQueries: 0,
      avgExecutionTime: 0,
      p50ExecutionTime: 0,
      p95ExecutionTime: 0,
      p99ExecutionTime: 0,
      errorRate: 0,
      slowQueries: [],
    };
  }
}
