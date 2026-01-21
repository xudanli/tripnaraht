// src/agent/context-engine/dto/context-api-client.ts
/**
 * Context API 客户端示例代码
 * 
 * 前端可以直接使用这些函数调用 Context API
 */

import type {
  ApiResponse,
  BuildContextPackageRequest,
  BuildContextPackageResponse,
  CompressContextRequest,
  CompressContextResponse,
  ProjectStateRequest,
  ProjectStateResponse,
  WriteBackRequest,
  GetMetricsQuery,
  GetMetricsResponse,
} from './context-api.types';

const API_BASE_URL = '/context';

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
    throw new Error(`HTTP error! status: ${response.status}`);
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
 * 构建 Context Package
 */
export async function buildContextPackage(
  params: BuildContextPackageRequest
): Promise<ApiResponse<BuildContextPackageResponse>> {
  return request<BuildContextPackageResponse>('/build', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * 压缩 Context
 */
export async function compressContext(
  params: CompressContextRequest
): Promise<ApiResponse<CompressContextResponse>> {
  return request<CompressContextResponse>('/compress', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * 投影状态
 */
export async function projectState(
  params: ProjectStateRequest
): Promise<ApiResponse<ProjectStateResponse>> {
  return request<ProjectStateResponse>('/project-state', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * 写入回写
 */
export async function writeBack(
  params: WriteBackRequest
): Promise<ApiResponse<{ message: string }>> {
  return request<{ message: string }>('/write-back', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * 获取指标
 */
export async function getMetrics(
  query: GetMetricsQuery = {}
): Promise<ApiResponse<GetMetricsResponse>> {
  const queryString = new URLSearchParams(
    Object.entries(query).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  return request<GetMetricsResponse>(`/metrics?${queryString}`, {
    method: 'GET',
  });
}

/**
 * 使用示例
 */
export const examples = {
  /**
   * 示例：构建 Context Package
   */
  async buildContextExample() {
    try {
      const response = await buildContextPackage({
        tripId: 'trip-123',
        phase: 'planning',
        agent: 'PLANNER',
        userQuery: '帮我规划冰岛7天行程',
        tokenBudget: 3600,
        requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'],
      });

      if (response.success && response.data) {
        const { contextPackage } = response.data;
        console.log('Context Package ID:', contextPackage.id);
        console.log('Total Tokens:', contextPackage.totalTokens);
        console.log('Blocks:', contextPackage.blocks.length);

        // 如果需要压缩
        if (contextPackage.totalTokens > contextPackage.tokenBudget) {
          const compressResponse = await compressContext({
            blocks: contextPackage.blocks,
            tokenBudget: contextPackage.tokenBudget,
            strategy: 'balanced',
          });

          if (compressResponse.success && compressResponse.data) {
            console.log('压缩后 Tokens:', compressResponse.data.stats.compressedTokens);
            return compressResponse.data.compressedBlocks;
          }
        }

        return contextPackage.blocks;
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('构建 Context Package 失败:', error);
      throw error;
    }
  },

  /**
   * 示例：获取指标
   */
  async getMetricsExample(tripId: string) {
    try {
      const response = await getMetrics({
        tripId,
        phase: 'planning',
        limit: 10,
      });

      if (response.success && response.data) {
        const { summary, recent } = response.data;
        console.log('平均 Token 使用:', summary.avgTokens);
        console.log('缓存命中率:', summary.cacheHitRate);
        console.log('质量分布:', summary.qualityDistribution);
        console.log('最近的记录:', recent);
        return { summary, recent };
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('获取指标失败:', error);
      throw error;
    }
  },
};
