// src/agent/interfaces/error-types.interface.ts

/**
 * 错误类型枚举
 * 
 * 用于分类不同类型的错误，便于前端处理和监控
 */
export enum ErrorType {
  /** 关键依赖缺失：关键服务不可用，无法继续执行 */
  CRITICAL_DEPENDENCY_MISSING = 'CRITICAL_DEPENDENCY_MISSING',
  
  /** 缺少必需参数：缺少必需的信息，需要用户澄清 */
  MISSING_REQUIRED_PARAM = 'MISSING_REQUIRED_PARAM',
  
  /** 权限不足：用户没有执行该操作的权限 */
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  /** 服务不可用：外部服务暂时不可用 */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  /** 验证错误：输入参数验证失败 */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  /** 超时错误：操作超时 */
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  /** 未知错误：未分类的错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 错误处理策略
 * 
 * 根据错误类型决定处理策略
 */
export interface ErrorHandlingStrategy {
  /** 是否应该拒绝请求 */
  shouldReject: boolean;
  
  /** 是否应该显示澄清消息 */
  shouldShowClarification: boolean;
  
  /** 是否允许重试 */
  allowRetry: boolean;
  
  /** 是否需要用户确认 */
  requiresUserConfirmation: boolean;
  
  /** 错误消息模板 */
  messageTemplate: string;
  
  /** 建议的解决方案 */
  suggestedSolutions: string[];
}

/**
 * 错误类型到处理策略的映射
 */
export const ERROR_HANDLING_STRATEGIES: Record<ErrorType, ErrorHandlingStrategy> = {
  [ErrorType.CRITICAL_DEPENDENCY_MISSING]: {
    shouldReject: true,
    shouldShowClarification: true,
    allowRetry: false,
    requiresUserConfirmation: false,
    messageTemplate: '无法完成行程规划，因为 {skillName} 的关键依赖服务不可用。',
    suggestedSolutions: [
      '检查服务状态',
      '联系系统管理员',
      '稍后重试',
    ],
  },
  
  [ErrorType.MISSING_REQUIRED_PARAM]: {
    shouldReject: false,
    shouldShowClarification: true,
    allowRetry: true,
    requiresUserConfirmation: true,
    messageTemplate: '无法完成行程规划，因为缺少必需的信息。',
    suggestedSolutions: [
      '提供完整的请求信息',
      '检查请求参数是否完整',
      '提供更多上下文信息',
    ],
  },
  
  [ErrorType.INSUFFICIENT_PERMISSIONS]: {
    shouldReject: true,
    shouldShowClarification: true,
    allowRetry: false,
    requiresUserConfirmation: false,
    messageTemplate: '您没有执行该操作的权限。',
    suggestedSolutions: [
      '检查您的权限设置',
      '联系系统管理员',
      '使用其他入口（如规划工作台）',
    ],
  },
  
  [ErrorType.SERVICE_UNAVAILABLE]: {
    shouldReject: false,
    shouldShowClarification: true,
    allowRetry: true,
    requiresUserConfirmation: false,
    messageTemplate: '服务暂时不可用，请稍后重试。',
    suggestedSolutions: [
      '稍后重试',
      '检查网络连接',
      '联系系统管理员',
    ],
  },
  
  [ErrorType.VALIDATION_ERROR]: {
    shouldReject: false,
    shouldShowClarification: true,
    allowRetry: true,
    requiresUserConfirmation: true,
    messageTemplate: '输入参数验证失败：{errorMessage}',
    suggestedSolutions: [
      '检查输入参数格式',
      '提供正确的参数值',
      '参考 API 文档',
    ],
  },
  
  [ErrorType.TIMEOUT_ERROR]: {
    shouldReject: false,
    shouldShowClarification: true,
    allowRetry: true,
    requiresUserConfirmation: false,
    messageTemplate: '操作超时，请稍后重试。',
    suggestedSolutions: [
      '稍后重试',
      '简化请求内容',
      '增加超时时间',
    ],
  },
  
  [ErrorType.UNKNOWN_ERROR]: {
    shouldReject: true,
    shouldShowClarification: true,
    allowRetry: false,
    requiresUserConfirmation: false,
    messageTemplate: '处理过程中出现未知错误：{errorMessage}',
    suggestedSolutions: [
      '联系系统管理员',
      '查看错误日志',
      '稍后重试',
    ],
  },
};

/**
 * 获取错误处理策略
 */
export function getErrorHandlingStrategy(errorType: ErrorType): ErrorHandlingStrategy {
  return ERROR_HANDLING_STRATEGIES[errorType] || ERROR_HANDLING_STRATEGIES[ErrorType.UNKNOWN_ERROR];
}

/**
 * 从错误对象中推断错误类型
 */
export function inferErrorType(error: any): ErrorType {
  // 检查是否是关键依赖缺失
  if (error?.isCriticalDependencyMissing) {
    return ErrorType.CRITICAL_DEPENDENCY_MISSING;
  }
  
  // 检查是否是缺少必需参数
  const errorMessage = error?.message || '';
  if (
    errorMessage.includes('是必需的') ||
    errorMessage.includes('is required') ||
    errorMessage.includes('必须提供') ||
    errorMessage.includes('必须传入') ||
    errorMessage.includes('缺少') ||
    errorMessage.includes('missing')
  ) {
    return ErrorType.MISSING_REQUIRED_PARAM;
  }
  
  // 检查是否是权限错误
  if (
    errorMessage.includes('权限') ||
    errorMessage.includes('permission') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden')
  ) {
    return ErrorType.INSUFFICIENT_PERMISSIONS;
  }
  
  // 检查是否是服务不可用
  if (
    errorMessage.includes('不可用') ||
    errorMessage.includes('unavailable') ||
    errorMessage.includes('service unavailable')
  ) {
    return ErrorType.SERVICE_UNAVAILABLE;
  }
  
  // 检查是否是验证错误
  if (
    errorMessage.includes('验证') ||
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid')
  ) {
    return ErrorType.VALIDATION_ERROR;
  }
  
  // 检查是否是超时错误
  if (
    errorMessage.includes('超时') ||
    errorMessage.includes('timeout') ||
    error?.code === 'ETIMEDOUT'
  ) {
    return ErrorType.TIMEOUT_ERROR;
  }
  
  return ErrorType.UNKNOWN_ERROR;
}
