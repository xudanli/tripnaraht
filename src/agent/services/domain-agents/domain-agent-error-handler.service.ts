// src/agent/services/domain-agents/domain-agent-error-handler.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { DataQuality, EvidenceRef } from '../../interfaces/sub-agent.interface';

/**
 * Domain Agent 错误类型
 */
export enum DomainAgentErrorType {
  /** 数据源不可用 */
  DATA_SOURCE_UNAVAILABLE = 'DATA_SOURCE_UNAVAILABLE',
  /** 数据源超时 */
  DATA_SOURCE_TIMEOUT = 'DATA_SOURCE_TIMEOUT',
  /** 数据格式错误 */
  DATA_FORMAT_ERROR = 'DATA_FORMAT_ERROR',
  /** 数据验证失败 */
  DATA_VALIDATION_ERROR = 'DATA_VALIDATION_ERROR',
  /** 配额超限 */
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  /** 权限不足 */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** 未知错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Domain Agent 错误
 */
export class DomainAgentError extends Error {
  constructor(
    public readonly type: DomainAgentErrorType,
    public readonly agent: string,
    public readonly operation: string,
    message: string,
    public readonly originalError?: Error,
    public readonly context?: Record<string, any>,
  ) {
    super(`[${agent}.${operation}] ${message}`);
    this.name = 'DomainAgentError';
  }
}

/**
 * 降级策略
 */
export interface FallbackStrategy {
  /** 是否使用缓存数据 */
  useCache: boolean;
  /** 缓存最大年龄（秒） */
  maxCacheAge?: number;
  /** 是否使用默认值 */
  useDefaults: boolean;
  /** 默认值 */
  defaults?: any;
  /** 是否重试 */
  retry: boolean;
  /** 重试次数 */
  retryCount?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

/**
 * 错误处理结果
 */
export interface ErrorHandlingResult<T> {
  /** 是否成功恢复 */
  recovered: boolean;
  /** 返回数据（如果恢复） */
  data?: T;
  /** 数据质量（降级后） */
  data_quality: DataQuality;
  /** 错误证据 */
  evidence: EvidenceRef;
  /** 是否应该警告用户 */
  shouldWarnUser: boolean;
  /** 用户警告消息 */
  userWarning?: string;
}

/**
 * Domain Agent 统一错误处理服务
 * 
 * 提供：
 * - 错误分类和标准化
 * - 降级策略执行
 * - 错误追踪和日志
 * - 用户友好的错误消息
 */
@Injectable()
export class DomainAgentErrorHandler {
  private readonly logger = new Logger(DomainAgentErrorHandler.name);

  // 默认降级策略
  private readonly defaultStrategies: Record<string, FallbackStrategy> = {
    GeoAgent: {
      useCache: true,
      maxCacheAge: 86400, // 24 hours
      useDefaults: true,
      retry: true,
      retryCount: 2,
      retryDelay: 1000,
    },
    WeatherAgent: {
      useCache: true,
      maxCacheAge: 3600, // 1 hour
      useDefaults: true,
      retry: true,
      retryCount: 3,
      retryDelay: 500,
    },
    CostAgent: {
      useCache: true,
      maxCacheAge: 43200, // 12 hours
      useDefaults: true,
      retry: false,
    },
    ExperienceAgent: {
      useCache: false,
      useDefaults: true,
      retry: false,
    },
  };

  /**
   * 分类错误
   */
  classifyError(error: Error): DomainAgentErrorType {
    const msg = error.message.toLowerCase();

    if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('unavailable')) {
      return DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE;
    }
    if (msg.includes('timeout') || msg.includes('timedout') || msg.includes('etimedout')) {
      return DomainAgentErrorType.DATA_SOURCE_TIMEOUT;
    }
    if (msg.includes('parse') || msg.includes('json') || msg.includes('format')) {
      return DomainAgentErrorType.DATA_FORMAT_ERROR;
    }
    if (msg.includes('invalid') || msg.includes('validation')) {
      return DomainAgentErrorType.DATA_VALIDATION_ERROR;
    }
    if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('429')) {
      return DomainAgentErrorType.QUOTA_EXCEEDED;
    }
    if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) {
      return DomainAgentErrorType.PERMISSION_DENIED;
    }

    return DomainAgentErrorType.UNKNOWN_ERROR;
  }

  /**
   * 处理错误并尝试恢复
   */
  async handleError<T>(
    agent: string,
    operation: string,
    error: Error,
    fallbackData?: T,
    customStrategy?: Partial<FallbackStrategy>,
  ): Promise<ErrorHandlingResult<T>> {
    const errorType = this.classifyError(error);
    const strategy = { ...this.defaultStrategies[agent], ...customStrategy };

    // 创建标准化错误
    const _domainError = new DomainAgentError(
      errorType,
      agent,
      operation,
      error.message,
      error,
    );

    // 记录错误
    this.logger.warn(`[${agent}.${operation}] Error: ${errorType} - ${error.message}`);

    // 创建错误证据
    const evidence: EvidenceRef = {
      evidence_id: `error_${agent}_${Date.now()}`,
      source: `${agent}.${operation}`,
      timestamp: new Date().toISOString(),
      data: {
        error_type: errorType,
        error_message: error.message,
        recovered: false,
        strategy_applied: strategy,
      },
    };

    // 尝试恢复
    let recovered = false;
    let data: T | undefined;

    // 使用默认值恢复
    if (strategy.useDefaults && fallbackData !== undefined) {
      data = fallbackData;
      recovered = true;
      evidence.data.recovered = true;
      evidence.data.recovery_method = 'DEFAULTS';
    }

    // 生成降级后的数据质量
    const data_quality: DataQuality = {
      source_type: recovered ? 'ESTIMATED' : 'MOCK',
      freshness_seconds: 0,
      confidence: recovered ? 0.3 : 0.1,
      coverage: recovered ? 0.5 : 0.0,
      retrieved_at: new Date().toISOString(),
      fallback_info: {
        original_source: agent,
        fallback_reason: this.getErrorMessage(errorType),
        quality_impact: this.getQualityImpact(errorType),
      },
    };

    // 确定是否警告用户
    const shouldWarnUser = !recovered || errorType === DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE;
    const userWarning = shouldWarnUser ? this.getUserFriendlyMessage(agent, errorType) : undefined;

    return {
      recovered,
      data,
      data_quality,
      evidence,
      shouldWarnUser,
      userWarning,
    };
  }

  /**
   * 带重试的执行
   */
  async executeWithRetry<T>(
    agent: string,
    operation: string,
    fn: () => Promise<T>,
    fallbackData?: T,
    customStrategy?: Partial<FallbackStrategy>,
  ): Promise<{ data: T; evidence: EvidenceRef; data_quality: DataQuality }> {
    const strategy = { ...this.defaultStrategies[agent], ...customStrategy };
    const maxRetries = strategy.retry ? (strategy.retryCount || 2) : 0;
    const retryDelay = strategy.retryDelay || 1000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await fn();
        return {
          data,
          evidence: {
            evidence_id: `success_${agent}_${Date.now()}`,
            source: `${agent}.${operation}`,
            timestamp: new Date().toISOString(),
            data: { attempts: attempt + 1 },
          },
          data_quality: {
            source_type: 'REALTIME_API',
            freshness_seconds: 0,
            confidence: 0.9,
            coverage: 1.0,
            retrieved_at: new Date().toISOString(),
          },
        };
      } catch (error: any) {
        lastError = error;
        this.logger.debug(`[${agent}.${operation}] Attempt ${attempt + 1} failed: ${error.message}`);

        if (attempt < maxRetries) {
          await this.delay(retryDelay * Math.pow(2, attempt)); // 指数退避
        }
      }
    }

    // 所有重试都失败了
    const result = await this.handleError(agent, operation, lastError!, fallbackData, customStrategy);

    if (!result.recovered || result.data === undefined) {
      throw lastError;
    }

    return {
      data: result.data,
      evidence: result.evidence,
      data_quality: result.data_quality,
    };
  }

  /**
   * 获取错误消息
   */
  private getErrorMessage(type: DomainAgentErrorType): string {
    const messages: Record<DomainAgentErrorType, string> = {
      [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: 'Data source temporarily unavailable',
      [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: 'Request timed out',
      [DomainAgentErrorType.DATA_FORMAT_ERROR]: 'Data format error',
      [DomainAgentErrorType.DATA_VALIDATION_ERROR]: 'Data validation failed',
      [DomainAgentErrorType.QUOTA_EXCEEDED]: 'API quota exceeded',
      [DomainAgentErrorType.PERMISSION_DENIED]: 'Permission denied',
      [DomainAgentErrorType.UNKNOWN_ERROR]: 'Unknown error occurred',
    };
    return messages[type];
  }

  /**
   * 获取质量影响级别
   */
  private getQualityImpact(type: DomainAgentErrorType): 'NONE' | 'MINOR' | 'MODERATE' | 'SIGNIFICANT' {
    const impacts: Record<DomainAgentErrorType, 'NONE' | 'MINOR' | 'MODERATE' | 'SIGNIFICANT'> = {
      [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: 'SIGNIFICANT',
      [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: 'MODERATE',
      [DomainAgentErrorType.DATA_FORMAT_ERROR]: 'MODERATE',
      [DomainAgentErrorType.DATA_VALIDATION_ERROR]: 'MINOR',
      [DomainAgentErrorType.QUOTA_EXCEEDED]: 'MODERATE',
      [DomainAgentErrorType.PERMISSION_DENIED]: 'SIGNIFICANT',
      [DomainAgentErrorType.UNKNOWN_ERROR]: 'SIGNIFICANT',
    };
    return impacts[type];
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyMessage(agent: string, type: DomainAgentErrorType): string {
    const agentMessages: Record<string, Record<DomainAgentErrorType, string>> = {
      GeoAgent: {
        [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '地形数据暂时不可用，使用估算值',
        [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '地形数据获取超时，使用缓存数据',
        [DomainAgentErrorType.DATA_FORMAT_ERROR]: '地形数据格式异常',
        [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '地形数据验证失败',
        [DomainAgentErrorType.QUOTA_EXCEEDED]: '地形数据请求配额已用尽',
        [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问地形数据',
        [DomainAgentErrorType.UNKNOWN_ERROR]: '地形分析遇到未知问题',
      },
      WeatherAgent: {
        [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '天气数据暂时不可用，使用历史平均值',
        [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '天气数据获取超时',
        [DomainAgentErrorType.DATA_FORMAT_ERROR]: '天气数据格式异常',
        [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '天气数据验证失败',
        [DomainAgentErrorType.QUOTA_EXCEEDED]: '天气 API 请求配额已用尽',
        [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问天气数据',
        [DomainAgentErrorType.UNKNOWN_ERROR]: '天气预报遇到未知问题',
      },
      CostAgent: {
        [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '价格数据暂时不可用，使用估算值',
        [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '价格数据获取超时',
        [DomainAgentErrorType.DATA_FORMAT_ERROR]: '价格数据格式异常',
        [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '价格数据验证失败',
        [DomainAgentErrorType.QUOTA_EXCEEDED]: '价格 API 请求配额已用尽',
        [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问价格数据',
        [DomainAgentErrorType.UNKNOWN_ERROR]: '成本估算遇到未知问题',
      },
      ExperienceAgent: {
        [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '体验分析服务暂时不可用',
        [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '体验分析超时',
        [DomainAgentErrorType.DATA_FORMAT_ERROR]: '体验数据格式异常',
        [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '体验数据验证失败',
        [DomainAgentErrorType.QUOTA_EXCEEDED]: '体验分析请求配额已用尽',
        [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问体验分析',
        [DomainAgentErrorType.UNKNOWN_ERROR]: '体验分析遇到未知问题',
      },
    };

    return agentMessages[agent]?.[type] || `${agent} 遇到问题：${this.getErrorMessage(type)}`;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
