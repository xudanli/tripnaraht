// src/rag/services/retry-helper.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries?: number;

  /** 初始延迟（毫秒，默认 1000）*/
  initialDelayMs?: number;

  /** 最大延迟（毫秒，默认 30000）*/
  maxDelayMs?: number;

  /** 退避因子（默认 2，指数退避）*/
  backoffFactor?: number;

  /** 需要重试的错误类型（默认所有错误都重试）*/
  retryableErrors?: string[];

  /** 不需要重试的错误类型（优先级高于 retryableErrors）*/
  nonRetryableErrors?: string[];

  /** 是否记录日志（默认 true）*/
  logging?: boolean;
}

/**
 * 重试结果
 */
export interface RetryResult<T> {
  /** 执行结果 */
  result?: T;

  /** 是否成功 */
  success: boolean;

  /** 重试次数 */
  attemptCount: number;

  /** 总耗时（毫秒）*/
  totalDuration: number;

  /** 最后一次错误 */
  lastError?: Error;
}

/**
 * 错误重试辅助服务
 *
 * 特性：
 * - 指数退避（Exponential Backoff）
 * - 可配置重试策略
 * - 错误类型过滤
 * - 自动日志记录
 *
 * 用途：
 * - API 调用重试（Weather, Road Status, Google Places）
 * - Web Browse 重试
 * - 数据库查询重试
 */
@Injectable()
export class RetryHelperService {
  private readonly logger = new Logger(RetryHelperService.name);

  /**
   * 默认配置
   */
  private readonly DEFAULT_CONFIG: Required<RetryConfig> = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffFactor: 2,
    retryableErrors: [],
    nonRetryableErrors: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'NotFoundError',
      '400', // Bad Request
      '401', // Unauthorized
      '403', // Forbidden
      '404', // Not Found
    ],
    logging: true,
  };

  /**
   * 执行带重试的异步操作
   *
   * @param operation - 要执行的操作
   * @param config - 重试配置
   * @returns 重试结果
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config?: RetryConfig
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    let attemptCount = 0;
    let lastError: Error | undefined;

    while (attemptCount <= finalConfig.maxRetries) {
      attemptCount++;

      try {
        if (finalConfig.logging && attemptCount > 1) {
          this.logger.log(`[Retry] 第 ${attemptCount} 次尝试...`);
        }

        const result = await operation();

        const totalDuration = Date.now() - startTime;

        if (finalConfig.logging && attemptCount > 1) {
          this.logger.log(
            `[Retry] ✓ 第 ${attemptCount} 次尝试成功 (耗时: ${totalDuration}ms)`
          );
        }

        return {
          result,
          success: true,
          attemptCount,
          totalDuration,
        };
      } catch (error: any) {
        lastError = error;

        // 检查是否应该重试
        const shouldRetry = this.shouldRetry(error, attemptCount, finalConfig);

        if (!shouldRetry) {
          if (finalConfig.logging) {
            this.logger.warn(
              `[Retry] ✗ 不可重试错误或达到最大重试次数: ${error.message}`
            );
          }

          return {
            success: false,
            attemptCount,
            totalDuration: Date.now() - startTime,
            lastError,
          };
        }

        // 计算延迟时间（指数退避）
        const delay = this.calculateDelay(attemptCount, finalConfig);

        if (finalConfig.logging) {
          this.logger.warn(
            `[Retry] 第 ${attemptCount} 次尝试失败: ${error.message}, 等待 ${delay}ms 后重试...`
          );
        }

        // 等待后重试
        await this.sleep(delay);
      }
    }

    // 所有重试都失败
    return {
      success: false,
      attemptCount,
      totalDuration: Date.now() - startTime,
      lastError,
    };
  }

  /**
   * 判断错误是否应该重试
   */
  private shouldRetry(error: Error, attemptCount: number, config: Required<RetryConfig>): boolean {
    // 达到最大重试次数
    if (attemptCount >= config.maxRetries) {
      return false;
    }

    const errorName = error.name;
    const errorMessage = error.message;

    // 检查是否在不可重试列表中
    if (config.nonRetryableErrors.length > 0) {
      const isNonRetryable = config.nonRetryableErrors.some(pattern =>
        errorName.includes(pattern) || errorMessage.includes(pattern)
      );

      if (isNonRetryable) {
        return false;
      }
    }

    // 如果指定了可重试列表，检查是否在列表中
    if (config.retryableErrors.length > 0) {
      const isRetryable = config.retryableErrors.some(pattern =>
        errorName.includes(pattern) || errorMessage.includes(pattern)
      );

      return isRetryable;
    }

    // 默认重试
    return true;
  }

  /**
   * 计算延迟时间（指数退避）
   *
   * delay = initialDelay * (backoffFactor ^ (attemptCount - 1))
   */
  private calculateDelay(attemptCount: number, config: Required<RetryConfig>): number {
    const delay = config.initialDelayMs * Math.pow(config.backoffFactor, attemptCount - 1);
    return Math.min(delay, config.maxDelayMs);
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 创建预配置的重试器
   */
  createRetrier(config: RetryConfig) {
    return <T>(operation: () => Promise<T>) => this.executeWithRetry(operation, config);
  }

  /**
   * API 调用专用重试器（更激进的重试策略）
   */
  async retryApiCall<T>(
    operation: () => Promise<T>,
    _operationName: string
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(operation, {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffFactor: 2,
      retryableErrors: [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'NetworkError',
        'TimeoutError',
        '500', // Internal Server Error
        '502', // Bad Gateway
        '503', // Service Unavailable
        '504', // Gateway Timeout
      ],
      logging: true,
    });
  }

  /**
   * 数据库查询专用重试器（较少的重试次数）
   */
  async retryDbQuery<T>(
    operation: () => Promise<T>,
    _queryName: string
  ): Promise<RetryResult<T>> {
    return this.executeWithRetry(operation, {
      maxRetries: 2,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      backoffFactor: 2,
      retryableErrors: [
        'ECONNREFUSED',
        'ECONNRESET',
        'LockTimeout',
        'DeadlockDetected',
      ],
      logging: true,
    });
  }
}
