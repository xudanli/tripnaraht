// src/data-fusion/interfaces/fusion-error.interface.ts

/**
 * 数据融合错误类型
 */
export type FusionErrorType = 
  | 'DATA_SOURCE_ERROR'      // 数据源错误
  | 'CONFLICT_RESOLUTION_ERROR' // 冲突解决错误
  | 'FUSION_STRATEGY_ERROR'  // 融合策略错误
  | 'VALIDATION_ERROR'       // 验证错误
  | 'TIMEOUT_ERROR'          // 超时错误
  | 'RESOURCE_EXHAUSTED'     // 资源耗尽
  | 'UNKNOWN_ERROR';         // 未知错误

/**
 * 数据融合错误
 */
export class FusionError extends Error {
  constructor(
    message: string,
    public readonly type: FusionErrorType,
    public readonly sourceId?: string,
    public readonly retryable: boolean = false,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FusionError';
  }
}

/**
 * 错误恢复策略
 */
export type ErrorRecoveryStrategy = 
  | 'RETRY'           // 重试
  | 'FALLBACK'        // 降级
  | 'SKIP'            // 跳过
  | 'ABORT';          // 中止

/**
 * 错误恢复配置
 */
export interface ErrorRecoveryConfig {
  maxRetries?: number;
  retryDelay?: number;
  fallbackStrategy?: string;
  skipOnError?: boolean;
}
