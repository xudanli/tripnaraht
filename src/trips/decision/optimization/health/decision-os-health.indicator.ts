/**
 * Decision OS 健康检查指示器
 * 
 * 用于集成 NestJS Terminus 健康检查框架
 * 
 * @see https://docs.nestjs.com/recipes/terminus
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionOSFacadeService } from '../decision-os-facade.service';
import { DecisionMetricsService } from '../metrics/decision-metrics.service';
import { DSOSnapshotAuditService } from '../learning/dso-snapshot-audit.service';
import { DistributedLockService } from '../../../../redis/distributed-lock.service';

// ========== 类型定义 ==========

export type HealthStatus = 'up' | 'down' | 'degraded';

export interface HealthIndicatorResult {
  [key: string]: {
    status: HealthStatus;
    details?: Record<string, unknown>;
    error?: string;
  };
}

export interface DecisionOSHealthResult extends HealthIndicatorResult {
  decisionOS: {
    status: HealthStatus;
    details: {
      uptime: number;
      totalDecisions: number;
      totalFeedback: number;
      convergenceStatus: string;
      components: {
        facade: boolean;
        metrics: boolean;
        audit: boolean;
        lock: boolean;
      };
      latency: {
        p50: number;
        p95: number;
        p99: number;
      };
      lastError?: string;
    };
  };
}

export interface ComponentHealthCheck {
  name: string;
  check: () => Promise<boolean>;
  critical: boolean;
}

// ========== 健康检查指示器 ==========

@Injectable()
export class DecisionOSHealthIndicator {
  private readonly logger = new Logger(DecisionOSHealthIndicator.name);
  private lastError: string | undefined;
  private latencyHistory: number[] = [];
  private readonly maxLatencyHistory = 100;

  constructor(
    @Optional() private readonly facade?: DecisionOSFacadeService,
    @Optional() private readonly metrics?: DecisionMetricsService,
    @Optional() private readonly audit?: DSOSnapshotAuditService,
    @Optional() private readonly lock?: DistributedLockService,
  ) {}

  /**
   * 执行完整健康检查
   */
  async check(): Promise<DecisionOSHealthResult> {
    try {
      const components = await this.checkComponents();
      const status = this.determineOverallStatus(components);
      const latencyStats = this.getLatencyStats();

      const facadeStatus = this.facade?.getSystemStatus() ?? {
        uptime: 0,
        metrics: { totalDecisions: 0, totalFeedback: 0, convergenceStatus: 'NOT_AVAILABLE' },
      };

      return {
        decisionOS: {
          status,
          details: {
            uptime: facadeStatus.uptime,
            totalDecisions: facadeStatus.metrics.totalDecisions,
            totalFeedback: facadeStatus.metrics.totalFeedback,
            convergenceStatus: facadeStatus.metrics.convergenceStatus,
            components: {
              facade: components.facade,
              metrics: components.metrics,
              audit: components.audit,
              lock: components.lock,
            },
            latency: latencyStats,
            lastError: this.lastError,
          },
        },
      };
    } catch (error) {
      this.lastError = (error as Error).message;
      this.logger.error(`健康检查失败: ${this.lastError}`);

      return {
        decisionOS: {
          status: 'down',
          details: {
            uptime: 0,
            totalDecisions: 0,
            totalFeedback: 0,
            convergenceStatus: 'ERROR',
            components: {
              facade: false,
              metrics: false,
              audit: false,
              lock: false,
            },
            latency: { p50: 0, p95: 0, p99: 0 },
            lastError: this.lastError,
          },
        },
      };
    }
  }

  /**
   * 简化健康检查（用于 liveness probe）
   */
  async isAlive(): Promise<boolean> {
    try {
      return !!this.facade;
    } catch {
      return false;
    }
  }

  /**
   * 就绪检查（用于 readiness probe）
   */
  async isReady(): Promise<boolean> {
    try {
      if (!this.facade) return false;

      const status = this.facade.getSystemStatus();
      return status.healthy;
    } catch {
      return false;
    }
  }

  /**
   * 记录决策延迟（用于健康指标）
   */
  recordLatency(latencyMs: number): void {
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }
  }

  /**
   * 清除错误状态
   */
  clearError(): void {
    this.lastError = undefined;
  }

  // ========== 私有方法 ==========

  private async checkComponents(): Promise<Record<string, boolean>> {
    const checks: ComponentHealthCheck[] = [
      {
        name: 'facade',
        check: async () => !!this.facade?.getSystemStatus(),
        critical: true,
      },
      {
        name: 'metrics',
        check: async () => {
          if (!this.metrics) return false;
          const exported = this.metrics.exportPrometheusFormat();
          return exported.length > 0;
        },
        critical: false,
      },
      {
        name: 'audit',
        check: async () => {
          if (!this.audit) return false;
          return true;
        },
        critical: false,
      },
      {
        name: 'lock',
        check: async () => {
          if (!this.lock) return false;
          const testResult = await this.lock.acquire('health-check-test', { ttlMs: 1000 });
          if (testResult.acquired && testResult.handle) {
            await this.lock.release(testResult.handle);
          }
          return true;
        },
        critical: false,
      },
    ];

    const results: Record<string, boolean> = {};

    for (const check of checks) {
      try {
        results[check.name] = await check.check();
      } catch (error) {
        this.logger.warn(`组件 ${check.name} 检查失败: ${(error as Error).message}`);
        results[check.name] = false;
      }
    }

    return results;
  }

  private determineOverallStatus(components: Record<string, boolean>): HealthStatus {
    const criticalComponents = ['facade'];
    const allCriticalUp = criticalComponents.every(c => components[c]);

    if (!allCriticalUp) {
      return 'down';
    }

    const totalComponents = Object.keys(components).length;
    const upComponents = Object.values(components).filter(v => v).length;

    if (upComponents === totalComponents) {
      return 'up';
    }

    return 'degraded';
  }

  private getLatencyStats(): { p50: number; p95: number; p99: number } {
    if (this.latencyHistory.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)] ?? 0,
      p95: sorted[Math.floor(len * 0.95)] ?? 0,
      p99: sorted[Math.floor(len * 0.99)] ?? 0,
    };
  }
}

// ========== Kubernetes 探针控制器 ==========

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class DecisionOSHealthController {
  constructor(private readonly healthIndicator: DecisionOSHealthIndicator) {}

  @Get()
  @ApiOperation({ summary: '完整健康检查' })
  @ApiResponse({ status: 200, description: '系统健康' })
  @ApiResponse({ status: 503, description: '系统不健康' })
  async getHealth(): Promise<DecisionOSHealthResult> {
    const result = await this.healthIndicator.check();
    return result;
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kubernetes liveness 探针' })
  @ApiResponse({ status: 200, description: '进程存活' })
  @ApiResponse({ status: 503, description: '进程不存活' })
  async liveness(): Promise<{ status: string }> {
    const alive = await this.healthIndicator.isAlive();
    if (!alive) {
      throw new Error('Service not alive');
    }
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kubernetes readiness 探针' })
  @ApiResponse({ status: 200, description: '服务就绪' })
  @ApiResponse({ status: 503, description: '服务未就绪' })
  async readiness(): Promise<{ status: string; ready: boolean }> {
    const ready = await this.healthIndicator.isReady();
    if (!ready) {
      throw new Error('Service not ready');
    }
    return { status: 'ok', ready: true };
  }

  @Get('startup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kubernetes startup 探针' })
  @ApiResponse({ status: 200, description: '启动完成' })
  @ApiResponse({ status: 503, description: '启动中' })
  async startup(): Promise<{ status: string }> {
    const alive = await this.healthIndicator.isAlive();
    if (!alive) {
      throw new Error('Service not started');
    }
    return { status: 'ok' };
  }
}
