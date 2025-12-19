// src/llm/utils/circuit-breaker.ts
/**
 * 熔断器（Circuit Breaker）
 * 
 * 用于在连续失败后暂时禁用 API 调用，避免"雪崩式重试"
 * 
 * 状态：
 * - CLOSED: 正常状态，允许调用
 * - OPEN: 熔断状态，拒绝调用（直接返回错误或降级）
 * - HALF_OPEN: 半开状态，允许少量试探性调用
 */

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // 失败阈值（连续失败多少次后熔断），默认 5
  resetTimeoutMs?: number; // 重置超时（熔断后多久进入 HALF_OPEN），默认 60000 (1分钟)
  halfOpenMaxCalls?: number; // HALF_OPEN 状态下允许的最大调用次数，默认 2
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private halfOpenSuccessCount = 0;
  
  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {}
  ) {
    const {
      failureThreshold = 5,
      resetTimeoutMs = 60000, // 1分钟
      halfOpenMaxCalls = 2,
    } = options;
    
    this.options = {
      failureThreshold,
      resetTimeoutMs,
      halfOpenMaxCalls,
    };
  }

  /**
   * 检查是否允许调用
   */
  isOpen(): boolean {
    const now = Date.now();
    
    // 如果处于 OPEN 状态，检查是否应该进入 HALF_OPEN
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.lastFailureTime && (now - this.lastFailureTime) >= this.options.resetTimeoutMs!) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenSuccessCount = 0;
        return false; // HALF_OPEN 允许调用
      }
      return true; // OPEN 状态拒绝调用
    }
    
    // CLOSED 或 HALF_OPEN 状态允许调用
    return false;
  }

  /**
   * 记录成功调用
   */
  recordSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenSuccessCount++;
      // 如果 HALF_OPEN 状态下成功次数达到阈值，恢复到 CLOSED
      if (this.halfOpenSuccessCount >= this.options.halfOpenMaxCalls!) {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.halfOpenSuccessCount = 0;
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // CLOSED 状态下成功，重置失败计数
      this.failureCount = 0;
    }
  }

  /**
   * 记录失败调用
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // HALF_OPEN 状态下失败，立即回到 OPEN
      this.state = CircuitBreakerState.OPEN;
      this.halfOpenSuccessCount = 0;
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // CLOSED 状态下失败次数达到阈值，进入 OPEN
      if (this.failureCount >= this.options.failureThreshold!) {
        this.state = CircuitBreakerState.OPEN;
      }
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * 获取失败计数
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * 手动重置熔断器（用于测试或紧急恢复）
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenSuccessCount = 0;
  }
}

