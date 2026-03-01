/**
 * Decision OS 错误处理模块
 * 
 * 统一的错误类型定义和处理策略
 */

// ========== 错误码定义 ==========

export enum DecisionErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN = 'DECISION_1000',
  INTERNAL = 'DECISION_1001',
  TIMEOUT = 'DECISION_1002',
  UNAVAILABLE = 'DECISION_1003',

  // 验证错误 (2xxx)
  VALIDATION_FAILED = 'DECISION_2000',
  INVALID_DSO = 'DECISION_2001',
  INVALID_REQUEST_ID = 'DECISION_2002',
  INVALID_USER_ID = 'DECISION_2003',
  MISSING_REQUIRED_FIELD = 'DECISION_2004',

  // 约束错误 (3xxx)
  CONSTRAINT_VIOLATION = 'DECISION_3000',
  HARD_CONSTRAINT_VIOLATED = 'DECISION_3001',
  SOFT_CONSTRAINT_VIOLATED = 'DECISION_3002',
  INFEASIBLE_SOLUTION = 'DECISION_3003',

  // 状态错误 (4xxx)
  INVALID_STATE = 'DECISION_4000',
  STATE_TRANSITION_FAILED = 'DECISION_4001',
  DSO_NOT_FOUND = 'DECISION_4002',
  VERSION_CONFLICT = 'DECISION_4003',
  ROLLBACK_FAILED = 'DECISION_4004',

  // 并发错误 (5xxx)
  LOCK_ACQUISITION_FAILED = 'DECISION_5000',
  LOCK_TIMEOUT = 'DECISION_5001',
  CONCURRENT_MODIFICATION = 'DECISION_5002',

  // 学习错误 (6xxx)
  LEARNING_FAILED = 'DECISION_6000',
  CONVERGENCE_FAILED = 'DECISION_6001',
  FEEDBACK_PROCESSING_FAILED = 'DECISION_6002',

  // 外部服务错误 (7xxx)
  EXTERNAL_SERVICE_ERROR = 'DECISION_7000',
  DATABASE_ERROR = 'DECISION_7001',
  CACHE_ERROR = 'DECISION_7002',
}

// ========== 错误类定义 ==========

export interface ErrorDetails {
  field?: string;
  expected?: unknown;
  actual?: unknown;
  constraint?: string;
  version?: number;
  [key: string]: unknown;
}

export class DecisionError extends Error {
  public readonly code: DecisionErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetails;
  public readonly retryable: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: DecisionErrorCode,
    statusCode: number = 500,
    details?: ErrorDetails,
    retryable: boolean = false,
  ) {
    super(message);
    this.name = 'DecisionError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace?.(this, DecisionError);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      retryable: this.retryable,
      timestamp: this.timestamp,
    };
  }
}

// ========== 具体错误类 ==========

export class ValidationError extends DecisionError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, DecisionErrorCode.VALIDATION_FAILED, 400, details, false);
    this.name = 'ValidationError';
  }
}

export class ConstraintViolationError extends DecisionError {
  constructor(message: string, constraint: string, isHard: boolean = false, details?: ErrorDetails) {
    super(
      message,
      isHard ? DecisionErrorCode.HARD_CONSTRAINT_VIOLATED : DecisionErrorCode.SOFT_CONSTRAINT_VIOLATED,
      422,
      { ...details, constraint },
      false,
    );
    this.name = 'ConstraintViolationError';
  }
}

export class StateError extends DecisionError {
  constructor(message: string, code: DecisionErrorCode = DecisionErrorCode.INVALID_STATE, details?: ErrorDetails) {
    super(message, code, 409, details, false);
    this.name = 'StateError';
  }
}

export class LockError extends DecisionError {
  constructor(message: string, code: DecisionErrorCode = DecisionErrorCode.LOCK_ACQUISITION_FAILED, details?: ErrorDetails) {
    super(message, code, 503, details, true);
    this.name = 'LockError';
  }
}

export class LearningError extends DecisionError {
  constructor(message: string, code: DecisionErrorCode = DecisionErrorCode.LEARNING_FAILED, details?: ErrorDetails) {
    super(message, code, 500, details, true);
    this.name = 'LearningError';
  }
}

export class ExternalServiceError extends DecisionError {
  constructor(message: string, service: string, details?: ErrorDetails) {
    super(message, DecisionErrorCode.EXTERNAL_SERVICE_ERROR, 502, { ...details, service }, true);
    this.name = 'ExternalServiceError';
  }
}

// ========== 错误工厂 ==========

export class DecisionErrorFactory {
  static validation(field: string, message: string, expected?: unknown, actual?: unknown): ValidationError {
    return new ValidationError(message, { field, expected, actual });
  }

  static invalidDSO(reason: string): ValidationError {
    return new ValidationError(`无效的 DSO: ${reason}`, { field: 'dso' });
  }

  static missingField(field: string): ValidationError {
    return new ValidationError(`缺少必需字段: ${field}`, { field });
  }

  static constraintViolation(constraint: string, message: string, isHard: boolean = false): ConstraintViolationError {
    return new ConstraintViolationError(message, constraint, isHard);
  }

  static infeasibleSolution(violations: string[]): ConstraintViolationError {
    return new ConstraintViolationError(
      `无法找到可行解: ${violations.join(', ')}`,
      'FEASIBILITY',
      true,
      { violations },
    );
  }

  static dsoNotFound(requestId: string): StateError {
    return new StateError(`未找到 DSO: ${requestId}`, DecisionErrorCode.DSO_NOT_FOUND, { requestId });
  }

  static versionConflict(expected: number, actual: number): StateError {
    return new StateError(
      `版本冲突: 预期 ${expected}, 实际 ${actual}`,
      DecisionErrorCode.VERSION_CONFLICT,
      { expected, actual },
    );
  }

  static lockTimeout(resource: string, timeout: number): LockError {
    return new LockError(
      `获取锁超时: ${resource} (${timeout}ms)`,
      DecisionErrorCode.LOCK_TIMEOUT,
      { resource, timeout },
    );
  }

  static lockAcquisitionFailed(resource: string): LockError {
    return new LockError(
      `无法获取锁: ${resource}`,
      DecisionErrorCode.LOCK_ACQUISITION_FAILED,
      { resource },
    );
  }

  static learningFailed(reason: string): LearningError {
    return new LearningError(`学习失败: ${reason}`);
  }

  static convergenceFailed(iterations: number): LearningError {
    return new LearningError(
      `收敛失败: 经过 ${iterations} 次迭代后未收敛`,
      DecisionErrorCode.CONVERGENCE_FAILED,
      { iterations },
    );
  }

  static databaseError(operation: string, originalError?: Error): ExternalServiceError {
    return new ExternalServiceError(
      `数据库操作失败: ${operation}`,
      'database',
      { operation, originalError: originalError?.message },
    );
  }

  static cacheError(operation: string, originalError?: Error): ExternalServiceError {
    return new ExternalServiceError(
      `缓存操作失败: ${operation}`,
      'cache',
      { operation, originalError: originalError?.message },
    );
  }
}

// ========== 错误处理器 ==========

export interface ErrorHandler {
  canHandle(error: unknown): boolean;
  handle(error: unknown): DecisionError;
}

export class DefaultErrorHandler implements ErrorHandler {
  canHandle(_error: unknown): boolean {
    return true;
  }

  handle(error: unknown): DecisionError {
    if (error instanceof DecisionError) {
      return error;
    }

    if (error instanceof Error) {
      return new DecisionError(
        error.message,
        DecisionErrorCode.INTERNAL,
        500,
        { originalError: error.name },
        false,
      );
    }

    return new DecisionError(
      String(error),
      DecisionErrorCode.UNKNOWN,
      500,
      undefined,
      false,
    );
  }
}

export class ErrorHandlerChain {
  private handlers: ErrorHandler[] = [];

  addHandler(handler: ErrorHandler): this {
    this.handlers.push(handler);
    return this;
  }

  handle(error: unknown): DecisionError {
    for (const handler of this.handlers) {
      if (handler.canHandle(error)) {
        return handler.handle(error);
      }
    }
    return new DefaultErrorHandler().handle(error);
  }
}

// ========== 错误恢复策略 ==========

export interface RecoveryStrategy {
  canRecover(error: DecisionError): boolean;
  recover(error: DecisionError, context: unknown): Promise<unknown>;
}

export class RetryRecoveryStrategy implements RecoveryStrategy {
  constructor(
    private maxRetries: number = 3,
    private baseDelay: number = 1000,
    private maxDelay: number = 30000,
  ) {}

  canRecover(error: DecisionError): boolean {
    return error.retryable;
  }

  async recover(error: DecisionError, context: { fn: () => Promise<unknown>; attempt?: number }): Promise<unknown> {
    const attempt = context.attempt ?? 0;

    if (attempt >= this.maxRetries) {
      throw error;
    }

    const delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
    await this.sleep(delay);

    return context.fn();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class FallbackRecoveryStrategy implements RecoveryStrategy {
  constructor(private fallbackFn: () => unknown) {}

  canRecover(_error: DecisionError): boolean {
    return true;
  }

  async recover(_error: DecisionError, _context: unknown): Promise<unknown> {
    return this.fallbackFn();
  }
}
