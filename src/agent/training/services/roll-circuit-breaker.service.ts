// src/agent/training/services/roll-circuit-breaker.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * 断路器状态
 */
enum CircuitState {
  CLOSED = 'CLOSED', // 正常状态
  OPEN = 'OPEN', // 打开状态（拒绝请求）
  HALF_OPEN = 'HALF_OPEN', // 半开状态（尝试恢复）
}

/**
 * RollCircuitBreakerService
 *
 * 职责：实现断路器模式，防止级联故障
 */
@Injectable()
export class RollCircuitBreakerService {
  private readonly logger = new Logger(RollCircuitBreakerService.name);

  /**
   * 断路器配置
   */
  private readonly config = {
    failureThreshold: 5, // 失败阈值
    successThreshold: 2, // 成功阈值（半开状态下）
    timeout: 60000, // 打开状态的超时时间（毫秒）
    resetTimeout: 30000, // 重置超时时间（毫秒）
  };

  /**
   * 断路器状态
   */
  private circuitStates: Map<string, {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    lastStateChangeTime: number;
  }> = new Map();

  /**
   * 执行操作（带断路器保护）
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const state = this.getCircuitState(operationName);

    // 检查断路器状态
    if (state.state === CircuitState.OPEN) {
      // 检查是否可以进入半开状态
      if (Date.now() - state.lastStateChangeTime >= this.config.timeout) {
        this.transitionToHalfOpen(operationName);
      } else {
        throw new Error(
          `Circuit breaker is OPEN for ${operationName}. Please retry later.`,
        );
      }
    }

    try {
      const result = await operation();

      // 记录成功
      this.recordSuccess(operationName);

      return result;
    } catch (error: any) {
      // 记录失败
      this.recordFailure(operationName);

      throw error;
    }
  }

  /**
   * 获取断路器状态
   */
  private getCircuitState(operationName: string): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    lastStateChangeTime: number;
  } {
    if (!this.circuitStates.has(operationName)) {
      this.circuitStates.set(operationName, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastStateChangeTime: Date.now(),
      });
    }

    return this.circuitStates.get(operationName)!;
  }

  /**
   * 记录成功
   */
  private recordSuccess(operationName: string): void {
    const state = this.getCircuitState(operationName);

    if (state.state === CircuitState.HALF_OPEN) {
      state.successCount++;
      if (state.successCount >= this.config.successThreshold) {
        this.transitionToClosed(operationName);
      }
    } else if (state.state === CircuitState.CLOSED) {
      // 重置失败计数
      state.failureCount = 0;
    }
  }

  /**
   * 记录失败
   */
  private recordFailure(operationName: string): void {
    const state = this.getCircuitState(operationName);

    state.failureCount++;
    state.lastFailureTime = Date.now();

    if (state.state === CircuitState.HALF_OPEN) {
      // 半开状态下失败，立即打开
      this.transitionToOpen(operationName);
    } else if (
      state.state === CircuitState.CLOSED &&
      state.failureCount >= this.config.failureThreshold
    ) {
      // 达到失败阈值，打开断路器
      this.transitionToOpen(operationName);
    }
  }

  /**
   * 转换到打开状态
   */
  private transitionToOpen(operationName: string): void {
    const state = this.getCircuitState(operationName);
    state.state = CircuitState.OPEN;
    state.lastStateChangeTime = Date.now();
    state.successCount = 0;

    this.logger.warn(
      `[CircuitBreaker] ${operationName} 断路器已打开 (failures: ${state.failureCount})`,
    );
  }

  /**
   * 转换到半开状态
   */
  private transitionToHalfOpen(operationName: string): void {
    const state = this.getCircuitState(operationName);
    state.state = CircuitState.HALF_OPEN;
    state.lastStateChangeTime = Date.now();
    state.successCount = 0;
    state.failureCount = 0;

    this.logger.log(
      `[CircuitBreaker] ${operationName} 断路器进入半开状态`,
    );
  }

  /**
   * 转换到关闭状态（正常）
   */
  private transitionToClosed(operationName: string): void {
    const state = this.getCircuitState(operationName);
    state.state = CircuitState.CLOSED;
    state.lastStateChangeTime = Date.now();
    state.failureCount = 0;
    state.successCount = 0;

    this.logger.log(
      `[CircuitBreaker] ${operationName} 断路器已关闭（恢复正常）`,
    );
  }

  /**
   * 获取断路器状态（用于监控）
   */
  getState(operationName: string): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    const state = this.getCircuitState(operationName);
    return {
      state: state.state,
      failureCount: state.failureCount,
      successCount: state.successCount,
      lastFailureTime: state.lastFailureTime,
    };
  }

  /**
   * 重置断路器
   */
  reset(operationName: string): void {
    this.circuitStates.delete(operationName);
    this.logger.log(`[CircuitBreaker] ${operationName} 断路器已重置`);
  }
}
