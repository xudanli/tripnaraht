/**
 * Airbnb Monitoring Service
 * 
 * 监控 Airbnb API 调用成本、使用情况和性能
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface AirbnbCallMetrics {
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

export interface AirbnbDailyStats {
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
  /** 总成本估算（USD，基于 Airbnb API 定价） */
  estimatedCost: number;
}

@Injectable()
export class AirbnbMonitoringService implements OnModuleInit {
  private readonly logger = new Logger(AirbnbMonitoringService.name);
  private readonly metricsKeyPrefix = 'airbnb:metrics:';
  private readonly statsKeyPrefix = 'airbnb:stats:';

  // Airbnb API 定价（基于公开信息，实际价格可能不同）
  // 注意：Airbnb MCP 服务可能是免费的，这里先设置较低的成本
  private readonly pricing = {
    airbnb_search: 0.0001, // 每次调用约 $0.0001（假设）
    airbnb_listing_details: 0.0001, // 每次调用约 $0.0001（假设）
    default: 0.0001, // 默认价格
  };

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {}

  async onModuleInit() {
    this.logger.log('AirbnbMonitoringService initialized');
  }

  /**
   * 记录 API 调用指标
   */
  async recordCall(metrics: AirbnbCallMetrics): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0];
      const timestamp = Date.now();

      // 存储单个调用指标（简化处理：只更新每日统计，不存储单个指标）
      // 注意：RedisService 不支持 lpush/ltrim/expire，这里跳过单个指标存储

      // 更新每日统计
      await this.updateDailyStats(date, metrics);

      // 记录日志
      this.logger.debug(
        `Airbnb API call: ${metrics.toolName} - ${metrics.success ? 'success' : 'failed'} ` +
        `(${metrics.responseTime}ms)`
      );
    } catch (error: any) {
      this.logger.warn(`Failed to record Airbnb call metrics: ${error.message}`);
    }
  }

  /**
   * 更新每日统计
   */
  private async updateDailyStats(date: string, metrics: AirbnbCallMetrics): Promise<void> {
    if (!this.redisService) {
      return;
    }

    try {
      const statsKey = `${this.statsKeyPrefix}${date}`;
      const existingStats = await this.redisService.get<string>(statsKey);
      
      let stats: AirbnbDailyStats;
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
      stats.totalCalls++;
      if (metrics.success) {
        stats.successfulCalls++;
      } else {
        stats.failedCalls++;
      }

      // 更新平均响应时间
      const totalResponseTime = stats.avgResponseTime * (stats.totalCalls - 1) + metrics.responseTime;
      stats.avgResponseTime = totalResponseTime / stats.totalCalls;

      // 更新按工具分组的调用次数
      stats.callsByTool[metrics.toolName] = (stats.callsByTool[metrics.toolName] || 0) + 1;

      // 更新成本估算
      const callCost = this.pricing[metrics.toolName as keyof typeof this.pricing] || this.pricing.default;
      stats.estimatedCost += callCost;

      // 保存统计
      await this.redisService.set(statsKey, JSON.stringify(stats), 86400 * 30); // 保留 30 天
    } catch (error: any) {
      this.logger.warn(`Failed to update daily stats: ${error.message}`);
    }
  }

  /**
   * 获取每日统计
   */
  async getDailyStats(date: string): Promise<AirbnbDailyStats | null> {
    if (!this.redisService) {
      return null;
    }

    try {
      const statsKey = `${this.statsKeyPrefix}${date}`;
      const statsJson = await this.redisService.get<string>(statsKey);
      return statsJson ? JSON.parse(statsJson) : null;
    } catch (error: any) {
      this.logger.warn(`Failed to get daily stats: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取最近 N 天的统计
   */
  async getRecentStats(days: number = 7): Promise<AirbnbDailyStats[]> {
    const stats: AirbnbDailyStats[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dailyStats = await this.getDailyStats(dateStr);
      if (dailyStats) {
        stats.push(dailyStats);
      }
    }

    return stats.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 获取总成本估算（最近 N 天）
   */
  async getTotalCostEstimate(days: number = 30): Promise<number> {
    const stats = await this.getRecentStats(days);
    return stats.reduce((total, stat) => total + stat.estimatedCost, 0);
  }

  /**
   * 检查是否超过成本限制
   */
  async checkCostLimit(dailyLimit: number = 1): Promise<{
    exceeded: boolean;
    currentCost: number;
    limit: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const stats = await this.getDailyStats(today);
    const currentCost = stats?.estimatedCost || 0;

    return {
      exceeded: currentCost > dailyLimit,
      currentCost,
      limit: dailyLimit,
    };
  }

  /**
   * 获取性能指标
   */
  async getPerformanceMetrics(days: number = 7): Promise<{
    avgResponseTime: number;
    successRate: number;
    totalCalls: number;
    callsByTool: Record<string, number>;
  }> {
    const stats = await this.getRecentStats(days);
    
    if (stats.length === 0) {
      return {
        avgResponseTime: 0,
        successRate: 0,
        totalCalls: 0,
        callsByTool: {},
      };
    }

    const totalCalls = stats.reduce((sum, s) => sum + s.totalCalls, 0);
    const successfulCalls = stats.reduce((sum, s) => sum + s.successfulCalls, 0);
    const totalResponseTime = stats.reduce((sum, s) => sum + s.avgResponseTime * s.totalCalls, 0);
    
    const callsByTool: Record<string, number> = {};
    stats.forEach(stat => {
      Object.entries(stat.callsByTool).forEach(([tool, count]) => {
        callsByTool[tool] = (callsByTool[tool] || 0) + count;
      });
    });

    return {
      avgResponseTime: totalCalls > 0 ? totalResponseTime / totalCalls : 0,
      successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
      totalCalls,
      callsByTool,
    };
  }
}
