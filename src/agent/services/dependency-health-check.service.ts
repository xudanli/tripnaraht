// src/agent/services/dependency-health-check.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 依赖健康检查状态
 */
export interface DependencyHealthStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
  lastChecked: Date;
}

/**
 * 依赖健康检查结果
 */
export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  dependencies: DependencyHealthStatus[];
  timestamp: Date;
}

/**
 * 依赖健康检查配置
 */
export interface DependencyCheckConfig {
  name: string;
  check: () => Promise<{ healthy: boolean; latency?: number; error?: string }>;
  required: boolean; // 是否必需（必需依赖不健康时整体状态为 unhealthy）
  timeout: number; // 超时时间（毫秒）
}

/**
 * 依赖健康检查服务
 *
 * 用于检查 ClaudeOrchestrator 的所有 Optional 依赖的健康状态
 * 在启动时和运行时定期检查，确保依赖可用性
 */
@Injectable()
export class DependencyHealthCheckService implements OnModuleInit {
  private readonly logger = new Logger(DependencyHealthCheckService.name);

  private dependencies: Map<string, DependencyCheckConfig> = new Map();
  private healthStatus: Map<string, DependencyHealthStatus> = new Map();
  private checkInterval?: NodeJS.Timeout;
  private readonly defaultCheckInterval = 5 * 60 * 1000; // 5分钟

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log('初始化依赖健康检查服务');

    // 启动时执行一次健康检查
    await this.checkAllDependencies();

    // 启动定期检查
    const interval = this.configService.get<number>('DEPENDENCY_HEALTH_CHECK_INTERVAL', this.defaultCheckInterval);
    if (interval > 0) {
      this.checkInterval = setInterval(() => {
        this.checkAllDependencies().catch((error) => {
          this.logger.error(`定期健康检查失败: ${error.message}`);
        });
      }, interval);
      this.logger.log(`依赖健康检查已启用，检查间隔: ${interval}ms`);
    } else {
      this.logger.warn('依赖健康检查已禁用（DEPENDENCY_HEALTH_CHECK_INTERVAL <= 0）');
    }
  }

  /**
   * 注册依赖检查
   */
  registerDependency(config: DependencyCheckConfig): void {
    this.dependencies.set(config.name, config);
    this.logger.debug(`注册依赖检查: ${config.name} (required=${config.required})`);
  }

  /**
   * 批量注册依赖检查
   */
  registerDependencies(configs: DependencyCheckConfig[]): void {
    configs.forEach((config) => this.registerDependency(config));
  }

  /**
   * 检查单个依赖
   */
  async checkDependency(name: string): Promise<DependencyHealthStatus> {
    const config = this.dependencies.get(name);
    if (!config) {
      throw new Error(`依赖检查未注册: ${name}`);
    }

    const startTime = Date.now();

    try {
      // 带超时的检查
      const result = await Promise.race([
        config.check(),
        new Promise<{ healthy: boolean; error?: string }>((resolve) =>
          setTimeout(() => resolve({ healthy: false, error: '检查超时' }), config.timeout),
        ),
      ]);

      const latency = Date.now() - startTime;
      const status: 'healthy' | 'degraded' | 'unhealthy' = result.healthy ? 'healthy' : 'unhealthy';

      const healthStatus: DependencyHealthStatus = {
        name,
        status,
        latency,
        error: result.error,
        lastChecked: new Date(),
      };

      this.healthStatus.set(name, healthStatus);

      if (status === 'unhealthy') {
        this.logger.warn(`依赖 ${name} 不健康: ${result.error || '未知原因'}`);
      } else {
        this.logger.debug(`依赖 ${name} 健康，延迟: ${latency}ms`);
      }

      return healthStatus;
    } catch (error: any) {
      const latency = Date.now() - startTime;
      const healthStatus: DependencyHealthStatus = {
        name,
        status: 'unhealthy',
        latency,
        error: error.message,
        lastChecked: new Date(),
      };

      this.healthStatus.set(name, healthStatus);
      this.logger.error(`依赖 ${name} 检查失败: ${error.message}`);

      return healthStatus;
    }
  }

  /**
   * 检查所有依赖
   */
  async checkAllDependencies(): Promise<HealthCheckResult> {
    this.logger.debug('开始检查所有依赖');

    const checks = Array.from(this.dependencies.entries()).map(async ([name, _config]) => {
      try {
        return await this.checkDependency(name);
      } catch (error: any) {
        return {
          name,
          status: 'unhealthy' as const,
          error: error.message,
          lastChecked: new Date(),
        };
      }
    });

    const results = await Promise.all(checks);

    // 计算整体状态
    const requiredUnhealthy = results.filter(
      (r) => this.dependencies.get(r.name)?.required && r.status === 'unhealthy',
    ).length;

    const anyUnhealthy = results.some((r) => r.status === 'unhealthy');
    const anyDegraded = results.some((r) => r.status === 'degraded');

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (requiredUnhealthy > 0) {
      overall = 'unhealthy';
    } else if (anyUnhealthy) {
      overall = 'degraded';
    } else if (anyDegraded) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    const result: HealthCheckResult = {
      overall,
      dependencies: results,
      timestamp: new Date(),
    };

    this.logger.log(
      `依赖健康检查完成: overall=${overall}, healthy=${results.filter((r) => r.status === 'healthy').length}, unhealthy=${results.filter((r) => r.status === 'unhealthy').length}`,
    );

    return result;
  }

  /**
   * 获取单个依赖的健康状态
   */
  getDependencyStatus(name: string): DependencyHealthStatus | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * 获取所有依赖的健康状态
   */
  getAllDependencyStatus(): DependencyHealthStatus[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * 检查依赖是否健康
   */
  isDependencyHealthy(name: string): boolean {
    const status = this.healthStatus.get(name);
    return status?.status === 'healthy';
  }

  /**
   * 检查必需依赖是否全部健康
   */
  areRequiredDependenciesHealthy(): boolean {
    for (const [name, config] of this.dependencies.entries()) {
      if (config.required && !this.isDependencyHealthy(name)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 获取不健康的依赖列表
   */
  getUnhealthyDependencies(): string[] {
    return Array.from(this.healthStatus.entries())
      .filter(([, status]) => status.status !== 'healthy')
      .map(([name]) => name);
  }

  /**
   * 清理定期检查
   */
  onModuleDestroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.logger.log('依赖健康检查已停止');
    }
  }
}
