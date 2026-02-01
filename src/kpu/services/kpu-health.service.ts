// src/kpu/services/kpu-health.service.ts
/**
 * KPU健康检查服务
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { LlmService } from '../../llm/services/llm.service';
import { KPUMonitoringService } from './kpu-monitoring.service';

export interface KPUHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error' | 'disabled';
    llm: 'ok' | 'error' | 'disabled';
  };
  metrics: {
    totalValidations: number;
    successRate: number;
    avgLatency: number;
    cacheHitRate: number;
  };
  timestamp: Date;
}

@Injectable()
export class KPUHealthService {
  private readonly logger = new Logger(KPUHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly llmService: LlmService,
    private readonly monitoringService: KPUMonitoringService,
  ) {}

  /**
   * 检查KPU健康状态
   */
  async checkHealth(): Promise<KPUHealthStatus> {
    const services = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      llm: await this.checkLlm(),
    };

    const metrics = this.monitoringService.getMetrics();
    const successRate = metrics.totalValidations > 0
      ? (metrics.successfulValidations / metrics.totalValidations) * 100
      : 100;

    // 判断整体状态
    const errorCount = Object.values(services).filter(s => s === 'error').length;
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (errorCount === 0) {
      status = 'healthy';
    } else if (errorCount === 1 && services.redis === 'error') {
      status = 'degraded'; // Redis错误不影响核心功能
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      services,
      metrics: {
        totalValidations: metrics.totalValidations,
        successRate: Math.round(successRate * 100) / 100,
        avgLatency: Math.round(metrics.avgValidationLatency),
        cacheHitRate: Math.round(metrics.cacheHitRate * 100) / 100,
      },
      timestamp: new Date(),
    };
  }

  /**
   * 检查数据库连接
   */
  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (error) {
      this.logger.error('数据库健康检查失败', error);
      return 'error';
    }
  }

  /**
   * 检查Redis连接
   */
  private async checkRedis(): Promise<'ok' | 'error' | 'disabled'> {
    if (!this.redisService) {
      return 'disabled';
    }
    try {
      await this.redisService.get('health_check');
      return 'ok';
    } catch (error) {
      this.logger.warn('Redis健康检查失败', error);
      return 'error';
    }
  }

  /**
   * 检查LLM服务
   */
  private async checkLlm(): Promise<'ok' | 'error' | 'disabled'> {
    if (!this.llmService) {
      return 'disabled';
    }
    // LLM服务检查：检查是否有配置的API Key
    const hasApiKey = !!(
      process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY
    );
    return hasApiKey ? 'ok' : 'error';
  }
}
