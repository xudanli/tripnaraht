/**
 * 熔断器服务
 * 
 * 实现 Circuit Breaker 模式，保护系统免受级联故障
 * 
 * 状态机：CLOSED → OPEN → HALF_OPEN → CLOSED
 */

import { Injectable, Logger } from '@nestjs/common';

// ========== 类型定义 ==========

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  halfOpenMaxCalls: number;
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface CircuitBreakerOptions {
  name: string;
  config?: Partial<CircuitBreakerConfig>;
  onStateChange?: (from: CircuitState, to: CircuitState, stats: CircuitStats) => void;
  onFailure?: (error: Error, stats: CircuitStats) => void;
  onSuccess?: (stats: CircuitStats) => void;
  fallback?: () => unknown;
}

export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly stats: CircuitStats,
    public readonly resetTime: number,
  ) {
    super(`Circuit breaker '${circuitName}' is OPEN. Reset in ${Math.ceil(resetTime / 1000)}s`);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ========== 熔断器实现 ==========

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private halfOpenCalls: number = 0;
  private totalCalls: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;

  private readonly config: CircuitBreakerConfig;
  private readonly logger = new Logger(CircuitBreaker.name);

  constructor(private readonly options: CircuitBreakerOptions) {
    this.config = {
      failureThreshold: options.config?.failureThreshold ?? 5,
      successThreshold: options.config?.successThreshold ?? 3,
      timeout: options.config?.timeout ?? 30000,
      resetTimeout: options.config?.resetTimeout ?? 60000,
      halfOpenMaxCalls: options.config?.halfOpenMaxCalls ?? 3,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        const resetTime = this.config.resetTimeout - (Date.now() - (this.lastFailureTime ?? 0));
        
        if (this.options.fallback) {
          this.logger.debug(`[${this.options.name}] Circuit OPEN, using fallback`);
          return this.options.fallback() as T;
        }
        
        throw new CircuitBreakerOpenError(this.options.name, this.getStats(), resetTime);
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        const resetTime = this.config.resetTimeout;
        
        if (this.options.fallback) {
          return this.options.fallback() as T;
        }
        
        throw new CircuitBreakerOpenError(this.options.name, this.getStats(), resetTime);
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await this.withTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = 0;
    this.successes = 0;
    this.halfOpenCalls = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
  }

  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
    this.lastFailureTime = Date.now();
  }

  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private onSuccess(): void {
    this.successes++;
    this.totalSuccesses++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();

    this.options.onSuccess?.(this.getStats());

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.failures = 0;
        this.halfOpenCalls = 0;
      }
    }
  }

  private onFailure(error: Error): void {
    this.failures++;
    this.totalFailures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = Date.now();

    this.options.onFailure?.(error, this.getStats());

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
      this.halfOpenCalls = 0;
    } else if (this.state === CircuitState.CLOSED) {
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;

    this.logger.log(`[${this.options.name}] State transition: ${oldState} → ${newState}`);
    this.options.onStateChange?.(oldState, newState, this.getStats());

    if (newState === CircuitState.CLOSED) {
      this.consecutiveFailures = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenCalls = 0;
      this.consecutiveSuccesses = 0;
    }
  }
}

// ========== 熔断器管理服务 ==========

@Injectable()
export class CircuitBreakerService {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly logger = new Logger(CircuitBreakerService.name);

  getOrCreate(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    
    if (!breaker) {
      breaker = new CircuitBreaker({
        name,
        ...options,
        onStateChange: (from, to, stats) => {
          this.logger.log(`Circuit '${name}': ${from} → ${to} (failures: ${stats.consecutiveFailures})`);
          options?.onStateChange?.(from, to, stats);
        },
      });
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};
    this.breakers.forEach((breaker, name) => {
      stats[name] = breaker.getStats();
    });
    return stats;
  }

  reset(name: string): boolean {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      return true;
    }
    return false;
  }

  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }

  remove(name: string): boolean {
    return this.breakers.delete(name);
  }
}

// ========== 装饰器 ==========

const circuitBreakerMetadataKey = Symbol('circuitBreaker');

export interface CircuitBreakerDecoratorOptions {
  name?: string;
  config?: Partial<CircuitBreakerConfig>;
  fallback?: string;
}

export function UseCircuitBreaker(options: CircuitBreakerDecoratorOptions = {}): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const circuitName = options.name ?? `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = async function (...args: unknown[]) {
      const service = (this as any).circuitBreakerService as CircuitBreakerService | undefined;
      
      if (!service) {
        return originalMethod.apply(this, args);
      }

      let fallbackFn: (() => unknown) | undefined;
      if (options.fallback) {
        const fallbackMethod = (this as any)[options.fallback];
        if (typeof fallbackMethod === 'function') {
          fallbackFn = () => fallbackMethod.apply(this, args);
        }
      }

      const breaker = service.getOrCreate(circuitName, {
        config: options.config,
        fallback: fallbackFn,
      });

      return breaker.execute(() => originalMethod.apply(this, args));
    };

    Reflect.defineMetadata(circuitBreakerMetadataKey, options, target, propertyKey);

    return descriptor;
  };
}

// ========== 预配置熔断器（开发环境） ==========

export const DecisionOSCircuitConfigs = {
  database: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000,
    resetTimeout: 30000,
    halfOpenMaxCalls: 2,
  } as CircuitBreakerConfig,

  redis: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 3000,
    resetTimeout: 15000,
    halfOpenMaxCalls: 3,
  } as CircuitBreakerConfig,

  externalApi: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 10000,
    resetTimeout: 60000,
    halfOpenMaxCalls: 1,
  } as CircuitBreakerConfig,

  learning: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    resetTimeout: 120000,
    halfOpenMaxCalls: 2,
  } as CircuitBreakerConfig,
};

// ========== P0.3 优化：生产环境熔断器配置 ==========

export const ProductionCircuitConfigs = {
  /**
   * 数据库熔断器（生产环境）
   * - 更严格的失败阈值
   * - 更长的恢复时间
   * - 支持滚动窗口监控
   */
  database: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 10000,
    resetTimeout: 60000,
    halfOpenMaxCalls: 3,
  } as CircuitBreakerConfig,

  /**
   * Redis 熔断器（生产环境）
   * - 快速超时避免阻塞
   * - 较高的容错阈值（Redis 通常更稳定）
   */
  redis: {
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 2000,
    resetTimeout: 30000,
    halfOpenMaxCalls: 5,
  } as CircuitBreakerConfig,

  /**
   * 世界模型熔断器（生产环境）
   * - Monte Carlo 采样可能较慢
   * - 失败时使用确定性回退
   */
  worldModel: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    resetTimeout: 60000,
    halfOpenMaxCalls: 3,
  } as CircuitBreakerConfig,

  /**
   * 外部 API 熔断器（生产环境）
   * - 网络调用不可靠
   * - 快速熔断保护系统
   */
  externalApi: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 5000,
    resetTimeout: 120000,
    halfOpenMaxCalls: 2,
  } as CircuitBreakerConfig,

  /**
   * 学习模块熔断器（生产环境）
   * - 学习失败不应影响主流程
   * - 较长的恢复时间
   */
  learning: {
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 60000,
    resetTimeout: 300000,
    halfOpenMaxCalls: 3,
  } as CircuitBreakerConfig,

  /**
   * 策略网络熔断器（生产环境）
   * - 神经网络推理
   * - 失败时使用规则回退
   */
  policyNetwork: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 5000,
    resetTimeout: 60000,
    halfOpenMaxCalls: 2,
  } as CircuitBreakerConfig,

  /**
   * DSO 快照熔断器（生产环境）
   * - 审计日志写入
   * - 失败时跳过但不影响主流程
   */
  dsoSnapshot: {
    failureThreshold: 10,
    successThreshold: 5,
    timeout: 5000,
    resetTimeout: 60000,
    halfOpenMaxCalls: 5,
  } as CircuitBreakerConfig,
};

/**
 * 根据环境获取熔断器配置
 */
export function getCircuitConfig(
  name: keyof typeof ProductionCircuitConfigs,
  isProduction: boolean = process.env.NODE_ENV === 'production',
): CircuitBreakerConfig {
  if (isProduction) {
    return ProductionCircuitConfigs[name] ?? DecisionOSCircuitConfigs.externalApi;
  }
  
  const devConfig = (DecisionOSCircuitConfigs as Record<string, CircuitBreakerConfig>)[name];
  return devConfig ?? DecisionOSCircuitConfigs.externalApi;
}

/**
 * 熔断器健康状态
 */
export interface CircuitHealthStatus {
  name: string;
  state: CircuitState;
  healthy: boolean;
  failureRate: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  recommendation?: string;
}

/**
 * 获取熔断器健康报告
 */
export function getCircuitHealthReport(stats: CircuitStats, name: string): CircuitHealthStatus {
  const totalAttempts = stats.totalCalls;
  const failureRate = totalAttempts > 0 ? stats.totalFailures / totalAttempts : 0;
  
  let recommendation: string | undefined;
  
  if (stats.state === CircuitState.OPEN) {
    recommendation = '熔断器已打开，检查下游服务健康状态';
  } else if (failureRate > 0.5) {
    recommendation = '高失败率，考虑增加超时或检查服务';
  } else if (stats.consecutiveFailures > 3) {
    recommendation = '连续失败，可能存在间歇性问题';
  }
  
  return {
    name,
    state: stats.state,
    healthy: stats.state === CircuitState.CLOSED && failureRate < 0.1,
    failureRate,
    lastFailure: stats.lastFailureTime ? new Date(stats.lastFailureTime) : undefined,
    lastSuccess: stats.lastSuccessTime ? new Date(stats.lastSuccessTime) : undefined,
    recommendation,
  };
}
