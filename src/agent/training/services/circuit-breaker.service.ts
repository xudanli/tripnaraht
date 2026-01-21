// src/agent/training/services/circuit-breaker.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * CircuitBreakerService
 * 
 * 职责：实现熔断器（状态管理、触发条件）
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers: Map<string, CircuitBreakerState> = new Map();

  /**
   * 执行操作（带熔断保护）
   */
  async execute<T>(
    name: string,
    operation: () => Promise<T>,
    config: CircuitBreakerConfig = {},
  ): Promise<T> {
    const breaker = this.getOrCreateBreaker(name, config);
    const state = breaker.state;

    // 如果熔断器打开，直接拒绝
    if (state === 'OPEN') {
      if (Date.now() - breaker.lastFailureTime < breaker.timeout) {
        throw new Error(`Circuit breaker is OPEN for ${name}`);
      } else {
        // 尝试半开状态
        breaker.state = 'HALF_OPEN';
        breaker.halfOpenAttempts = 0;
      }
    }

    try {
      const result = await operation();
      this.onSuccess(breaker);
      return result;
    } catch (error: any) {
      this.onFailure(breaker, config);
      throw error;
    }
  }

  /**
   * 获取或创建熔断器
   */
  private getOrCreateBreaker(
    name: string,
    config: CircuitBreakerConfig,
  ): CircuitBreakerState {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, {
        name,
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastSuccessTime: Date.now(),
        timeout: config.timeout || 60000, // 默认60秒
        failureThreshold: config.failureThreshold || 5,
        halfOpenAttempts: 0,
        halfOpenMaxAttempts: config.halfOpenMaxAttempts || 3,
      });
    }
    return this.breakers.get(name)!;
  }

  /**
   * 成功回调
   */
  private onSuccess(breaker: CircuitBreakerState): void {
    breaker.successCount++;
    breaker.lastSuccessTime = Date.now();

    if (breaker.state === 'HALF_OPEN') {
      breaker.halfOpenAttempts++;
      if (breaker.halfOpenAttempts >= breaker.halfOpenMaxAttempts) {
        breaker.state = 'CLOSED';
        breaker.failureCount = 0;
        this.logger.log(`[CircuitBreaker] ${breaker.name} 恢复为CLOSED状态`);
      }
    } else if (breaker.state === 'CLOSED') {
      // 重置失败计数
      breaker.failureCount = 0;
    }
  }

  /**
   * 失败回调
   */
  private onFailure(breaker: CircuitBreakerState, config: CircuitBreakerConfig): void {
    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    if (breaker.state === 'HALF_OPEN') {
      // 半开状态下失败，立即打开
      breaker.state = 'OPEN';
      this.logger.warn(`[CircuitBreaker] ${breaker.name} 从HALF_OPEN转为OPEN状态`);
    } else if (
      breaker.state === 'CLOSED' &&
      breaker.failureCount >= breaker.failureThreshold
    ) {
      // 关闭状态下失败次数达到阈值，打开熔断器
      breaker.state = 'OPEN';
      this.logger.warn(
        `[CircuitBreaker] ${breaker.name} 从CLOSED转为OPEN状态 (失败次数: ${breaker.failureCount})`,
      );
    }
  }

  /**
   * 获取熔断器状态
   */
  getState(name: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | undefined {
    return this.breakers.get(name)?.state;
  }

  /**
   * 重置熔断器
   */
  reset(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.state = 'CLOSED';
      breaker.failureCount = 0;
      breaker.successCount = 0;
      this.logger.log(`[CircuitBreaker] ${name} 已重置`);
    }
  }
}

/**
 * 熔断器状态
 */
interface CircuitBreakerState {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  timeout: number; // OPEN状态持续时间（毫秒）
  failureThreshold: number; // 失败阈值
  halfOpenAttempts: number;
  halfOpenMaxAttempts: number;
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  timeout?: number; // OPEN状态持续时间
  failureThreshold?: number; // 失败阈值
  halfOpenMaxAttempts?: number; // 半开状态最大尝试次数
}
