// src/common/dto/standard-response.dto.ts

/**
 * 统一响应格式
 * 
 * 所有接口必须遵循此格式，确保前端处理一致性
 */
export interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

/**
 * 错误响应格式
 */
export interface ErrorResponse {
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * 成功响应辅助函数
 */
export function successResponse<T>(data: T): StandardResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * 错误响应辅助函数
 */
export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, any>
): StandardResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

/**
 * 错误码常量
 */
export enum ErrorCode {
  // 验证错误
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // 资源未找到
  NOT_FOUND = 'NOT_FOUND',
  
  // Provider 错误（OCR/POI 等外部服务）
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  
  // 业务逻辑错误
  BUSINESS_ERROR = 'BUSINESS_ERROR',
  
  // 内部服务器错误
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  
  // 不支持的操作
  UNSUPPORTED_ACTION = 'UNSUPPORTED_ACTION',
}
