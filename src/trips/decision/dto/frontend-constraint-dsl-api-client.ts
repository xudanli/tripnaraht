// src/trips/decision/dto/frontend-constraint-dsl-api-client.ts
/**
 * 约束DSL API 前端客户端
 * 
 * 前端可以直接使用这些函数调用约束DSL相关API
 */

import type {
  ApiResponse,
  ConstraintDSL,
  DetectConflictsResponse,
  CheckConstraintsResponse,
  GenerateMultiplePlansResponse,
} from './frontend-constraint-dsl-api.types';

const API_BASE_URL = '/decision';

/**
 * 通用请求函数
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `HTTP error! status: ${response.status}`
    );
  }

  const data = await response.json();
  // Ensure the response has the success property
  if (typeof data === 'object' && data !== null && 'success' in data) {
    return data as ApiResponse<T>;
  }
  // If the response doesn't have success, wrap it
  return { success: true, data } as ApiResponse<T>;
}

/**
 * 检测约束冲突
 * 
 * @param constraints 约束DSL
 * @param plan 行程计划（可选，用于更精确的冲突检测）
 * @param state 世界状态（可选，用于更精确的冲突检测）
 */
export async function detectConflicts(
  constraints: ConstraintDSL,
  plan?: any,
  state?: any
): Promise<ApiResponse<DetectConflictsResponse>> {
  return request<DetectConflictsResponse>('/detect-conflicts', {
    method: 'POST',
    body: JSON.stringify({
      constraints,
      plan,
      state,
    }),
  });
}

/**
 * 检查约束并获取不可行性解释
 * 
 * @param state 世界状态
 * @param plan 行程计划
 */
export async function checkConstraintsWithExplanation(
  state: any,
  plan: any
): Promise<ApiResponse<CheckConstraintsResponse>> {
  return request<CheckConstraintsResponse>('/check-constraints-with-explanation', {
    method: 'POST',
    body: JSON.stringify({
      state,
      plan,
    }),
  });
}

/**
 * 生成多个方案变体
 * 
 * @param state 世界状态（必须包含 policies.constraintDSL）
 * @param constraints 约束DSL
 */
export async function generateMultiplePlans(
  state: any,
  constraints: ConstraintDSL
): Promise<ApiResponse<GenerateMultiplePlansResponse>> {
  return request<GenerateMultiplePlansResponse>('/generate-multiple-plans', {
    method: 'POST',
    body: JSON.stringify({
      state,
      constraints,
    }),
  });
}
