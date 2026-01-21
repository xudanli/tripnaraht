// src/agent/training/services/retry-policy.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * RetryPolicyService
 * 
 * 职责：实现重试策略（指数退避、最大重试次数）
 */
@Injectable()
export class RetryPolicyService {
  private readonly logger = new Logger(RetryPolicyService.name);

  /**
   * 执行操作（带重试）
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = {},
  ): Promise<T> {
    const maxRetries = config.maxRetries || 3;
    const initialDelay = config.initialDelay || 1000;
    const maxDelay = config.maxDelay || 30000;
    const backoffMultiplier = config.backoffMultiplier || 2;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          this.logger.warn(
            `[RetryPolicy] 操作失败，已达到最大重试次数: ${maxRetries}`,
          );
          throw error;
        }

        // 计算延迟时间（指数退避）
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay,
        );

        this.logger.debug(
          `[RetryPolicy] 操作失败，${delay}ms后重试 (尝试 ${attempt + 1}/${maxRetries})`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries?: number; // 最大重试次数
  initialDelay?: number; // 初始延迟（毫秒）
  maxDelay?: number; // 最大延迟（毫秒）
  backoffMultiplier?: number; // 退避乘数
}
