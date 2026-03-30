/**
 * Booking.com Monitoring Service
 * 
 * 监控 Booking.com API 调用成本、使用情况和性能
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface BookingComCallMetrics {
  /** 调用时间戳 */
  timestamp: number;
  /** 工具名称 */
  toolName: string;
  /** 调用是否成功 */
  success: boolean;
  /** 响应时间（毫秒） */
  responseTime: number;
  /** 结果数量 */
  resultCount?: number;
  /** 错误信息（如果失败） */
  error?: string;
}

export interface BookingComDailyStats {
  /** 日期（YYYY-MM-DD） */
  date: string;
  /** 总调用次数 */
  totalCalls: number;
  /** 成功调用次数 */
  successfulCalls: number;
  /** 失败调用次数 */
  failedCalls: number;
  /** 平均响应时间（毫秒） */
  avgResponseTime: number;
  /** 按工具分组的调用次数 */
  callsByTool: Record<string, number>;
  /** 总成本估算（USD，基于 RapidAPI Booking.com 定价） */
  estimatedCost: number;
}

@Injectable()
export class BookingComMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(BookingComMonitoringService.name);
  private readonly metricsKeyPrefix = 'booking-com:metrics:';
  private readonly statsKeyPrefix = 'booking-com:stats:';

  // RapidAPI Booking.com 定价（基于 RapidAPI 定价，实际价格可能不同）
  // 注意：RapidAPI 通常按请求数计费，价格可能因套餐而异
  private readonly pricing = {
    searchCarRentals: 0.01, // 每次调用约 $0.01（假设，实际价格需要查看 RapidAPI 定价）
    default: 0.01, // 默认价格
  };

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async onModuleInit() {
    this.logger.log('BookingComMonitoringService initialized');
  }

  /**
   * 记录 API 调用指标
   */
  async recordCall(metrics: BookingComCallMetrics): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0];

      // 存储单个调用指标（简化处理：只更新每日统计，不存储单个指标）
      // 注意：RedisService 不支持 lpush/ltrim/expire，这里跳过单个指标存储

      // 更新每日统计
      await this.updateDailyStats(date, metrics);

      // 记录日志
      this.logger.debug(
        `Booking.com API call: ${metrics.toolName} - ${metrics.success ? 'success' : 'failed'} ` +
        `(${metrics.responseTime}ms)`
      );
    } catch (error: any) {
      this.logger.warn(`Failed to record Booking.com call metrics: ${error.message}`);
    }
  }

  /**
   * 更新每日统计
   */
  private async updateDailyStats(date: string, metrics: BookingComCallMetrics): Promise<void> {
    if (!this.redisService) {
      return;
    }

    try {
      const statsKey = `${this.statsKeyPrefix}${date}`;
      const existingStats = await this.redisService.get<string>(statsKey);
      
      let stats: BookingComDailyStats;
      if (existingStats) {
        stats = JSON.parse(existingStats);
      } else {
        stats = {
          date,
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          avgResponseTime: 0,
          callsByTool: {},
          estimatedCost: 0,
        };
      }

      // 更新统计
      stats.totalCalls += 1;
      if (metrics.success) {
        stats.successfulCalls += 1;
      } else {
        stats.failedCalls += 1;
      }

      // 更新平均响应时间（加权平均）
      const totalResponseTime = stats.avgResponseTime * (stats.totalCalls - 1) + metrics.responseTime;
      stats.avgResponseTime = Math.round(totalResponseTime / stats.totalCalls);

      // 更新按工具分组的调用次数
      if (!stats.callsByTool[metrics.toolName]) {
        stats.callsByTool[metrics.toolName] = 0;
      }
      stats.callsByTool[metrics.toolName] += 1;

      // 更新成本估算
      const callCost = this.pricing[metrics.toolName as keyof typeof this.pricing] || this.pricing.default;
      stats.estimatedCost += callCost;

      // 保存统计（保留 30 天）
      await this.redisService.set(statsKey, JSON.stringify(stats), 2592000); // 30 天
    } catch (error: any) {
      this.logger.warn(`Failed to update Booking.com daily stats: ${error.message}`);
    }
  }

  /**
   * 获取每日统计
   */
  async getDailyStats(date: string): Promise<BookingComDailyStats | null> {
    if (!this.redisService) {
      return null;
    }

    try {
      const statsKey = `${this.statsKeyPrefix}${date}`;
      const statsJson = await this.redisService.get<string>(statsKey);
      if (!statsJson) {
        return null;
      }
      return JSON.parse(statsJson);
    } catch (error: any) {
      this.logger.warn(`Failed to get Booking.com daily stats: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取多日统计
   */
  async getStatsForDateRange(startDate: string, endDate: string): Promise<BookingComDailyStats[]> {
    if (!this.redisService) {
      return [];
    }

    const stats: BookingComDailyStats[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dailyStats = await this.getDailyStats(dateStr);
      if (dailyStats) {
        stats.push(dailyStats);
      }
    }

    return stats;
  }

  /**
   * 获取性能摘要
   */
  async getPerformanceSummary(days: number = 7): Promise<{
    avgResponseTime: number;
    successRate: number;
    totalCalls: number;
    callsByTool: Record<string, number>;
  }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.getStatsForDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    let totalCalls = 0;
    let totalSuccessfulCalls = 0;
    let totalResponseTime = 0;
    const callsByTool: Record<string, number> = {};

    for (const stat of stats) {
      totalCalls += stat.totalCalls;
      totalSuccessfulCalls += stat.successfulCalls;
      totalResponseTime += stat.avgResponseTime * stat.totalCalls;

      for (const [tool, count] of Object.entries(stat.callsByTool)) {
        if (!callsByTool[tool]) {
          callsByTool[tool] = 0;
        }
        callsByTool[tool] += count;
      }
    }

    return {
      avgResponseTime: totalCalls > 0 ? Math.round(totalResponseTime / totalCalls) : 0,
      successRate: totalCalls > 0 ? totalSuccessfulCalls / totalCalls : 0,
      totalCalls,
      callsByTool,
    };
  }

  /**
   * 获取总成本估算
   */
  async getTotalCostEstimate(days: number = 7): Promise<number> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.getStatsForDateRange(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    return stats.reduce((total, stat) => total + stat.estimatedCost, 0);
  }

  /**
   * 检查是否超过成本限制
   */
  async checkCostLimit(limit: number, days: number = 7): Promise<{
    exceeded: boolean;
    currentCost: number;
    limit: number;
  }> {
    const currentCost = await this.getTotalCostEstimate(days);
    return {
      exceeded: currentCost > limit,
      currentCost,
      limit,
    };
  }
}
