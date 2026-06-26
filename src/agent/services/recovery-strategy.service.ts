// src/agent/services/recovery-strategy.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrchestratorFailureDomain } from '../utils/orchestrator-failure-taxonomy.util';

/**
 * Recovery 配置
 */
export interface RecoveryConfig {
  maxRetries: number; // 最大重试次数
  initialBackoffMs: number; // 初始退避时间（毫秒）
  maxBackoffMs: number; // 最大退避时间（毫秒）
  backoffMultiplier: number; // 退避倍数
  retryableDomains: OrchestratorFailureDomain[]; // 可重试的失败域
}

/**
 * Recovery 策略类型
 */
export enum RecoveryStrategy {
  IMMEDIATE = 'IMMEDIATE', // 立即重试
  EXPONENTIAL_BACKOFF = 'EXPONENTIAL_BACKOFF', // 指数退避
  FIXED_DELAY = 'FIXED_DELAY', // 固定延迟
  CIRCUIT_BREAKER = 'CIRCUIT_BREAKER', // 熔断器
  FALLBACK = 'FALLBACK', // 降级
}

/**
 * Recovery 执行结果
 */
export interface RecoveryExecutionResult {
  attempt: number;
  backoffMs: number;
  strategy: RecoveryStrategy;
  success: boolean;
  error?: string;
  shouldContinue: boolean;
}

/**
 * Recovery 策略服务
 *
 * 实现智能重试和降级策略：
 * - 指数退避重试
 * - 基于失败域的重试决策
 * - 熔断器模式
 * - 最大重试次数限制
 */
@Injectable()
export class RecoveryStrategyService {
  private readonly logger = new Logger(RecoveryStrategyService.name);

  // 默认配置
  private readonly defaultConfig: RecoveryConfig = {
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    backoffMultiplier: 2,
    retryableDomains: [
      'TIMEOUT',
      'NETWORK',
      'TOOL',
    ],
  };

  private config: RecoveryConfig;

  // 熔断器状态
  private readonly circuitBreakerStates = new Map<string, {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  }>();

  // 熔断器配置
  private readonly circuitBreakerThreshold = 5; // 失败次数阈值
  private readonly circuitBreakerTimeout = 60 * 1000; // 熔断器超时（毫秒）

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.logger.log(`Recovery 策略服务初始化: maxRetries=${this.config.maxRetries}, initialBackoff=${this.config.initialBackoffMs}ms`);
  }

  /**
   * 从配置加载
   */
  private loadConfig(): RecoveryConfig {
    return {
      maxRetries: this.configService.get<number>('RECOVERY_MAX_RETRIES', this.defaultConfig.maxRetries),
      initialBackoffMs: this.configService.get<number>('RECOVERY_INITIAL_BACKOFF_MS', this.defaultConfig.initialBackoffMs),
      maxBackoffMs: this.configService.get<number>('RECOVERY_MAX_BACKOFF_MS', this.defaultConfig.maxBackoffMs),
      backoffMultiplier: this.configService.get<number>('RECOVERY_BACKOFF_MULTIPLIER', this.defaultConfig.backoffMultiplier),
      retryableDomains: this.defaultConfig.retryableDomains, // 可配置化
    };
  }

  /**
   * 判断是否应该重试
   */
  shouldRetry(
    failureDomain: OrchestratorFailureDomain,
    currentAttempt: number,
    circuitBreakerKey?: string,
  ): boolean {
    // 检查最大重试次数
    if (currentAttempt >= this.config.maxRetries) {
      this.logger.debug(`达到最大重试次数: ${currentAttempt}/${this.config.maxRetries}`);
      return false;
    }

    // 检查失败域是否可重试
    if (!this.config.retryableDomains.includes(failureDomain)) {
      this.logger.debug(`失败域不可重试: ${failureDomain}`);
      return false;
    }

    // 检查熔断器状态
    if (circuitBreakerKey && this.isCircuitBreakerOpen(circuitBreakerKey)) {
      this.logger.debug(`熔断器已打开: ${circuitBreakerKey}`);
      return false;
    }

    return true;
  }

  /**
   * 计算退避时间
   */
  calculateBackoff(attempt: number, strategy: RecoveryStrategy = RecoveryStrategy.EXPONENTIAL_BACKOFF): number {
    switch (strategy) {
      case RecoveryStrategy.IMMEDIATE:
        return 0;

      case RecoveryStrategy.FIXED_DELAY:
        return this.config.initialBackoffMs;

      case RecoveryStrategy.EXPONENTIAL_BACKOFF:
        // 指数退避：initial * (multiplier ^ (attempt - 1))
        const backoff = this.config.initialBackoffMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
        return Math.min(backoff, this.config.maxBackoffMs);

      default:
        return this.config.initialBackoffMs;
    }
  }

  /**
   * 选择 Recovery 策略
   */
  selectStrategy(failureDomain: OrchestratorFailureDomain, attempt: number): RecoveryStrategy {
    // 首次重试：立即重试
    if (attempt === 1) {
      return RecoveryStrategy.IMMEDIATE;
    }

    // 网络错误：使用固定延迟
    if (failureDomain === 'NETWORK') {
      return RecoveryStrategy.FIXED_DELAY;
    }

    // 其他情况：指数退避
    return RecoveryStrategy.EXPONENTIAL_BACKOFF;
  }

  /**
   * 执行 Recovery
   */
  async executeRecovery<T>(
    operation: () => Promise<T>,
    failureDomain: OrchestratorFailureDomain,
    circuitBreakerKey?: string,
  ): Promise<T> {
    let attempt = 0;
    const traceSummary: Array<{ attempt: number; backoff_ms: number; failure_code?: string }> = [];

    while (true) {
      attempt++;

      try {
        // 执行操作
        const result = await operation();

        // 成功：重置熔断器
        if (circuitBreakerKey) {
          this.resetCircuitBreaker(circuitBreakerKey);
        }

        this.logger.debug(`Recovery 成功: attempt=${attempt}`);
        return result;
      } catch (error: any) {
        const failureCode = error.code || error.name || 'UNKNOWN';

        // 记录失败
        if (circuitBreakerKey) {
          this.recordCircuitBreakerFailure(circuitBreakerKey);
        }

        // 判断是否应该重试
        if (!this.shouldRetry(failureDomain, attempt, circuitBreakerKey)) {
          this.logger.error(`Recovery 失败，不再重试: attempt=${attempt}, domain=${failureDomain}`);
          throw error;
        }

        // 选择策略并计算退避时间
        const strategy = this.selectStrategy(failureDomain, attempt);
        const backoffMs = this.calculateBackoff(attempt, strategy);

        traceSummary.push({
          attempt,
          backoff_ms: backoffMs,
          failure_code: failureCode,
        });

        this.logger.warn(
          `Recovery 失败，准备重试: attempt=${attempt}, strategy=${strategy}, backoff=${backoffMs}ms, error=${error.message}`,
        );

        // 退避等待
        if (backoffMs > 0) {
          await this.sleep(backoffMs);
        }
      }
    }
  }

  /**
   * 检查熔断器是否打开
   */
  private isCircuitBreakerOpen(key: string): boolean {
    const state = this.circuitBreakerStates.get(key);
    if (!state) return false;

    if (!state.isOpen) return false;

    // 检查是否可以尝试恢复
    if (Date.now() >= state.nextAttemptTime) {
      // 半开状态：允许一次尝试
      state.isOpen = false;
      state.failureCount = 0;
      this.logger.debug(`熔断器进入半开状态: ${key}`);
      return false;
    }

    return true;
  }

  /**
   * 记录熔断器失败
   */
  private recordCircuitBreakerFailure(key: string): void {
    let state = this.circuitBreakerStates.get(key);

    if (!state) {
      state = {
        isOpen: false,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
      };
      this.circuitBreakerStates.set(key, state);
    }

    state.failureCount++;
    state.lastFailureTime = Date.now();

    // 检查是否应该打开熔断器
    if (state.failureCount >= this.circuitBreakerThreshold && !state.isOpen) {
      state.isOpen = true;
      state.nextAttemptTime = Date.now() + this.circuitBreakerTimeout;
      this.logger.warn(`熔断器已打开: ${key}, failureCount=${state.failureCount}`);
    }
  }

  /**
   * 重置熔断器
   */
  private resetCircuitBreaker(key: string): void {
    const state = this.circuitBreakerStates.get(key);
    if (state) {
      state.isOpen = false;
      state.failureCount = 0;
      this.logger.debug(`熔断器已重置: ${key}`);
    }
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(key: string): { isOpen: boolean; failureCount: number } | undefined {
    const state = this.circuitBreakerStates.get(key);
    if (!state) return undefined;

    return {
      isOpen: state.isOpen,
      failureCount: state.failureCount,
    };
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取当前配置
   */
  getConfig(): RecoveryConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RecoveryConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.log(`Recovery 配置已更新: ${JSON.stringify(config)}`);
  }
}
