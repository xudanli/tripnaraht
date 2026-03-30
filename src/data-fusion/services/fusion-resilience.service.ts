// src/data-fusion/services/fusion-resilience.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { FusionError, ErrorRecoveryConfig } from '../interfaces/fusion-error.interface';

/**
 * 数据融合弹性服务
 * 
 * 提供统一的错误处理和容错机制：
 * - 错误分类和处理
 * - 智能重试策略
 * - 降级策略
 * - 资源限制保护
 */
@Injectable()
export class FusionResilienceService {
  private readonly logger = new Logger(FusionResilienceService.name);

  // 熔断器状态（简化版，参考AgentService的CircuitBreaker）
  private readonly circuitBreakers = new Map<string, {
    failures: number;
    lastFailureTime?: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  }>();

  private readonly CIRCUIT_BREAKER_THRESHOLD = 5; // 5次失败后熔断
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30秒后尝试恢复

  /**
   * 执行带错误处理的函数
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string,
    recoveryConfig?: ErrorRecoveryConfig
  ): Promise<T> {
    const config: Required<ErrorRecoveryConfig> = {
      maxRetries: recoveryConfig?.maxRetries || 3,
      retryDelay: recoveryConfig?.retryDelay || 1000,
      fallbackStrategy: recoveryConfig?.fallbackStrategy || 'RELIABILITY_WEIGHTED',
      skipOnError: recoveryConfig?.skipOnError || false,
    };

    // 检查熔断器
    if (!this.canExecute(operationName)) {
      throw new FusionError(
        `Circuit breaker is OPEN for ${operationName}`,
        'RESOURCE_EXHAUSTED',
        undefined,
        false
      );
    }

    let lastError: Error | undefined;
    let retryCount = 0;

    while (retryCount <= config.maxRetries) {
      try {
        const result = await operation();
        // 成功：重置熔断器
        this.onSuccess(operationName);
        return result;
      } catch (error: any) {
        lastError = error;
        const fusionError = this.classifyError(error, operationName);

        // 记录失败
        this.onFailure(operationName, fusionError);

        // 如果不可重试，直接抛出
        if (!fusionError.retryable || retryCount >= config.maxRetries) {
          if (config.skipOnError) {
            this.logger.warn(`Skipping operation ${operationName} due to error: ${fusionError.message}`);
            throw fusionError;
          }
          throw fusionError;
        }

        // 计算重试延迟（指数退避 + 抖动）
        const delay = this.calculateRetryDelay(retryCount, config.retryDelay);
        this.logger.warn(`Retrying ${operationName} (attempt ${retryCount + 1}/${config.maxRetries}) after ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      }
    }

    throw lastError || new FusionError('Operation failed after retries', 'UNKNOWN_ERROR');
  }

  /**
   * 分类错误
   */
  private classifyError(error: any, operationName: string): FusionError {
    const errorMessage = error?.message || String(error);

    // 超时错误
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
      return new FusionError(
        `Timeout error in ${operationName}: ${errorMessage}`,
        'TIMEOUT_ERROR',
        undefined,
        true, // 可重试
        error
      );
    }

    // 资源耗尽错误
    if (errorMessage.includes('resource') || errorMessage.includes('exhausted') || errorMessage.includes('limit')) {
      return new FusionError(
        `Resource exhausted in ${operationName}: ${errorMessage}`,
        'RESOURCE_EXHAUSTED',
        undefined,
        true, // 可重试（延迟后）
        error
      );
    }

    // 数据源错误
    if (errorMessage.includes('data source') || errorMessage.includes('source')) {
      return new FusionError(
        `Data source error in ${operationName}: ${errorMessage}`,
        'DATA_SOURCE_ERROR',
        undefined,
        true, // 可重试
        error
      );
    }

    // 验证错误（通常不可重试）
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return new FusionError(
        `Validation error in ${operationName}: ${errorMessage}`,
        'VALIDATION_ERROR',
        undefined,
        false, // 不可重试
        error
      );
    }

    // 未知错误（默认可重试）
    return new FusionError(
      `Unknown error in ${operationName}: ${errorMessage}`,
      'UNKNOWN_ERROR',
      undefined,
      true,
      error
    );
  }

  /**
   * 计算重试延迟（指数退避 + 抖动）
   */
  private calculateRetryDelay(retryCount: number, baseDelay: number): number {
    // 指数退避：baseDelay * 2^retryCount
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    
    // 添加随机抖动（±20%）
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    
    // 限制最大延迟为10秒
    return Math.min(exponentialDelay + jitter, 10000);
  }

  /**
   * 检查是否可以执行（熔断器检查）
   */
  private canExecute(operationName: string): boolean {
    const breaker = this.circuitBreakers.get(operationName);
    if (!breaker) {
      return true; // 没有记录，允许执行
    }

    if (breaker.state === 'CLOSED') {
      return true;
    }

    if (breaker.state === 'OPEN') {
      // 检查是否超过超时时间
      if (breaker.lastFailureTime && Date.now() - breaker.lastFailureTime >= this.CIRCUIT_BREAKER_TIMEOUT) {
        breaker.state = 'HALF_OPEN';
        return true; // 进入半开状态，允许一次尝试
      }
      return false;
    }

    // HALF_OPEN 状态允许一次尝试
    return true;
  }

  /**
   * 记录成功
   */
  private onSuccess(operationName: string): void {
    const breaker = this.circuitBreakers.get(operationName);
    if (breaker) {
      breaker.state = 'CLOSED';
      breaker.failures = 0;
    }
  }

  /**
   * 记录失败
   */
  private onFailure(operationName: string, _error: FusionError): void {
    let breaker = this.circuitBreakers.get(operationName);
    if (!breaker) {
      breaker = {
        failures: 0,
        state: 'CLOSED',
      };
      this.circuitBreakers.set(operationName, breaker);
    }

    breaker.failures++;
    breaker.lastFailureTime = Date.now();

    if (breaker.state === 'HALF_OPEN') {
      // 半开状态下失败，立即熔断
      breaker.state = 'OPEN';
      this.logger.error(`Circuit breaker OPENED for ${operationName} after HALF_OPEN failure`);
    } else if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      // 达到阈值，熔断
      breaker.state = 'OPEN';
      this.logger.error(`Circuit breaker OPENED for ${operationName} after ${breaker.failures} failures`);
    }
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(operationName: string): {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailureTime?: number;
  } | null {
    return this.circuitBreakers.get(operationName) || null;
  }
}
