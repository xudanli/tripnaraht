// src/agent/training/services/roll-monitoring.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RollClientService } from './roll-client.service';

/**
 * RollMonitoringService
 *
 * 职责：监控 ROLL 架构的运行状态和性能指标
 */
@Injectable()
export class RollMonitoringService {
  private readonly logger = new Logger(RollMonitoringService.name);
  private readonly enabled: boolean;
  private readonly bridgeUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly rollClient?: RollClientService,
  ) {
    this.enabled =
      this.configService.get<boolean>('ROLL_MONITORING_ENABLED') !== false &&
      !!this.rollClient;
    this.bridgeUrl =
      this.configService.get<string>('ROLL_BRIDGE_URL') ||
      'http://localhost:8001';
  }

  /**
   * 获取监控指标
   */
  async getMetrics(): Promise<{
    bridgeService?: any;
    rayCluster?: any;
    workers?: any;
  }> {
    if (!this.enabled) {
      return {};
    }

    try {
      const response = await fetch(`${this.bridgeUrl}/api/metrics`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      this.logger.warn(`[RollMonitoring] 获取指标失败: ${error.message}`);
      return {};
    }
  }

  /**
   * 获取 Workers 状态
   */
  async getWorkersStatus(): Promise<any> {
    if (!this.enabled) {
      return {};
    }

    try {
      const health = await this.rollClient!.healthCheck();
      return health;
    } catch (error: any) {
      this.logger.warn(`[RollMonitoring] 获取 Workers 状态失败: ${error.message}`);
      return {};
    }
  }

  /**
   * 检查系统健康状态
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    if (!this.enabled) {
      return {
        status: 'unhealthy',
        details: { reason: 'ROLL 监控未启用' },
      };
    }

    try {
      const health = await this.rollClient!.healthCheck();
      const metrics = await this.getMetrics();

      // 检查 Workers 可用性
      const workersAvailable = health.workersAvailable || [];
      const allWorkersHealthy = workersAvailable.length >= 3; // Actor, Reward, Policy

      // 检查错误率
      const errorRate = metrics.bridgeService?.error_rates || {};
      const hasHighErrorRate = Object.values(errorRate).some(
        (rate: any) => rate > 0.1,
      );

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (!allWorkersHealthy) {
        status = 'degraded';
      }

      if (hasHighErrorRate) {
        status = 'unhealthy';
      }

      return {
        status,
        details: {
          workersAvailable,
          allWorkersHealthy,
          errorRates: errorRate,
          metrics,
        },
      };
    } catch (error: any) {
      this.logger.error(`[RollMonitoring] 健康检查失败: ${error.message}`);
      return {
        status: 'unhealthy',
        details: { error: error.message },
      };
    }
  }
}
