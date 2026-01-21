// src/agent/training/services/roll-retry.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * RollRetryService
 *
 * 职责：实现 ROLL 调用的重试策略
 */
@Injectable()
export class RollRetryService {
  private readonly logger = new Logger(RollRetryService.name);

  /**
   * 重试配置
   */
  private readonly retryConfig = {
    maxRetries: 3,
    initialDelay: 100, // 毫秒
    maxDelay: 5000, // 毫秒
    backoffMultiplier: 2,
    retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'],
  };

  /**
   * 执行带重试的异步操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    customConfig?: Partial<typeof this.retryConfig>,
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customConfig };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 0) {
          this.logger.log(
            `[RollRetry] ${operationName} 重试成功 (attempt ${attempt + 1})`,
          );
        }
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        // 检查是否可重试
        if (!this.isRetryableError(error) || attempt >= config.maxRetries) {
          this.logger.error(
            `[RollRetry] ${operationName} 失败 (attempt ${attempt + 1}/${config.maxRetries + 1}): ${error.message}`,
          );
          throw error;
        }

        // 计算延迟（指数退避）
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
          config.maxDelay,
        );

        this.logger.warn(
          `[RollRetry] ${operationName} 失败，${delay}ms 后重试 (attempt ${attempt + 1}/${config.maxRetries + 1}): ${error.message}`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError || new Error(`${operationName} 重试失败`);
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    // 网络错误
    if (error.code && this.retryConfig.retryableErrors.includes(error.code)) {
      return true;
    }

    // HTTP 5xx 错误
    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    // 超时错误
    if (error.message?.includes('timeout') || error.message?.includes('TIMEOUT')) {
      return true;
    }

    // 连接错误
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
      return true;
    }

    return false;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
