// src/trips/decision/shared/tripnara-error-codes.ts
/**
 * TripNARA Error Codes
 * 
 * 统一的错误码规范
 * 格式: E_{CATEGORY}_{REASON}
 */

/**
 * Domain Tools 错误码
 */
export enum TripNARAErrorCode {
  // DEM 相关错误
  E_DEM_MISSING = 'E_DEM_MISSING',
  E_DEM_QUERY_FAILED = 'E_DEM_QUERY_FAILED',
  E_DEM_INVALID_PROFILE = 'E_DEM_INVALID_PROFILE',

  // 走廊/空间相关错误
  E_CORRIDOR_OUTSIDE = 'E_CORRIDOR_OUTSIDE',
  E_CORRIDOR_INVALID = 'E_CORRIDOR_INVALID',
  E_SPATIAL_QUERY_FAILED = 'E_SPATIAL_QUERY_FAILED',

  // 路线哲学相关错误
  E_PHILOSOPHY_VIOLATION = 'E_PHILOSOPHY_VIOLATION',
  E_CORE_EXPERIENCE_MISSING = 'E_CORE_EXPERIENCE_MISSING',

  // 硬约束违规
  E_HARD_VIOLATION = 'E_HARD_VIOLATION',
  E_HARD_DEM_VIOLATION = 'E_HARD_DEM_VIOLATION',
  E_HARD_COMPLIANCE_VIOLATION = 'E_HARD_COMPLIANCE_VIOLATION',

  // RouteDirection 相关错误
  E_ROUTE_NOT_FOUND = 'E_ROUTE_NOT_FOUND',
  E_ROUTE_INVALID = 'E_ROUTE_INVALID',
  E_ROUTE_SELECTION_FAILED = 'E_ROUTE_SELECTION_FAILED',

  // Context Tools 错误码
  E_CONTEXT_BUILD_FAILED = 'E_CONTEXT_BUILD_FAILED',
  E_TOKEN_BUDGET_EXCEEDED = 'E_TOKEN_BUDGET_EXCEEDED',
  E_BLOCKS_EMPTY = 'E_BLOCKS_EMPTY',
  E_CONTEXT_COMPRESS_FAILED = 'E_CONTEXT_COMPRESS_FAILED',

  // 通用错误
  E_INVALID_INPUT = 'E_INVALID_INPUT',
  E_EXECUTION_FAILED = 'E_EXECUTION_FAILED',
  E_SERVICE_UNAVAILABLE = 'E_SERVICE_UNAVAILABLE',
}

/**
 * 错误码分类
 */
export const ErrorCodeCategory = {
  DEM: [
    TripNARAErrorCode.E_DEM_MISSING,
    TripNARAErrorCode.E_DEM_QUERY_FAILED,
    TripNARAErrorCode.E_DEM_INVALID_PROFILE,
  ],
  SPATIAL: [
    TripNARAErrorCode.E_CORRIDOR_OUTSIDE,
    TripNARAErrorCode.E_CORRIDOR_INVALID,
    TripNARAErrorCode.E_SPATIAL_QUERY_FAILED,
  ],
  PHILOSOPHY: [
    TripNARAErrorCode.E_PHILOSOPHY_VIOLATION,
    TripNARAErrorCode.E_CORE_EXPERIENCE_MISSING,
  ],
  HARD_VIOLATION: [
    TripNARAErrorCode.E_HARD_VIOLATION,
    TripNARAErrorCode.E_HARD_DEM_VIOLATION,
    TripNARAErrorCode.E_HARD_COMPLIANCE_VIOLATION,
  ],
  ROUTE: [
    TripNARAErrorCode.E_ROUTE_NOT_FOUND,
    TripNARAErrorCode.E_ROUTE_INVALID,
    TripNARAErrorCode.E_ROUTE_SELECTION_FAILED,
  ],
  CONTEXT: [
    TripNARAErrorCode.E_CONTEXT_BUILD_FAILED,
    TripNARAErrorCode.E_TOKEN_BUDGET_EXCEEDED,
    TripNARAErrorCode.E_BLOCKS_EMPTY,
    TripNARAErrorCode.E_CONTEXT_COMPRESS_FAILED,
  ],
} as const;

/**
 * 错误响应格式
 */
export interface TripNARAErrorResponse {
  error: {
    code: TripNARAErrorCode;
    message: string;
    details?: any;
    category?: keyof typeof ErrorCodeCategory;
  };
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  code: TripNARAErrorCode,
  message: string,
  details?: any
): TripNARAErrorResponse {
  // 查找错误码所属分类
  let category: keyof typeof ErrorCodeCategory | undefined;
  for (const [cat, codes] of Object.entries(ErrorCodeCategory)) {
    if ((codes as readonly TripNARAErrorCode[]).includes(code)) {
      category = cat as keyof typeof ErrorCodeCategory;
      break;
    }
  }

  return {
    error: {
      code,
      message,
      details,
      category,
    },
  };
}
