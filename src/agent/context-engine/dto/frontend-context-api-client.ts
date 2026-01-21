// src/agent/context-engine/dto/frontend-context-api-client.ts
/**
 * Context API 前端客户端示例代码
 * 
 * 前端可以直接使用这些函数调用 Context API
 */

import type {
  ApiResponse,
  GetContextMetricsResponse,
  GetContextPackagesResponse,
  GetContextPackageDetailResponse,
  GetContextAnalyticsResponse,
  GetContextMetricsQuery,
  GetContextPackagesQuery,
  GetContextAnalyticsQuery,
} from './frontend-context-api.types';

const API_BASE_URL = '/api/context';

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
 * 获取 Context 指标统计
 */
export async function getContextMetrics(
  params?: GetContextMetricsQuery
): Promise<ApiResponse<GetContextMetricsResponse>> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  return request<GetContextMetricsResponse>(`/admin/metrics?${queryString}`, {
    method: 'GET',
  });
}

/**
 * 获取 Context Package 列表
 */
export async function getContextPackages(
  params?: GetContextPackagesQuery
): Promise<ApiResponse<GetContextPackagesResponse>> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  return request<GetContextPackagesResponse>(`/admin/packages?${queryString}`, {
    method: 'GET',
  });
}

/**
 * 获取 Context Package 详情
 */
export async function getContextPackageDetail(
  id: string
): Promise<ApiResponse<GetContextPackageDetailResponse>> {
  return request<GetContextPackageDetailResponse>(`/admin/packages/${id}`, {
    method: 'GET',
  });
}

/**
 * 获取 Context 分析报告
 */
export async function getContextAnalytics(
  params?: GetContextAnalyticsQuery
): Promise<ApiResponse<GetContextAnalyticsResponse>> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  return request<GetContextAnalyticsResponse>(`/admin/analytics?${queryString}`, {
    method: 'GET',
  });
}

/**
 * 使用示例
 */
export const examples = {
  /**
   * 示例：获取指标统计
   */
  async getMetricsExample() {
    try {
      const response = await getContextMetrics({
        startTime: '2025-01-01T00:00:00Z',
        endTime: '2025-01-31T23:59:59Z',
        agent: 'PLANNER',
      });

      if (response.success && response.data) {
        const { summary, byAgent, byPhase } = response.data;
        console.log('总记录数:', summary.totalRecords);
        console.log('平均 Token:', summary.avgTokens);
        console.log('缓存命中率:', summary.cacheHitRate);
        console.log('按 Agent 统计:', byAgent);
        console.log('按 Phase 统计:', byPhase);
        return { summary, byAgent, byPhase };
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('获取指标统计失败:', error);
      throw error;
    }
  },

  /**
   * 示例：获取 Context Package 列表
   */
  async getPackagesExample() {
    try {
      const response = await getContextPackages({
        page: 1,
        limit: 20,
        phase: 'planning',
        agent: 'PLANNER',
        search: '冰岛',
      });

      if (response.success && response.data) {
        const { packages, total, totalPages } = response.data;
        console.log(`共 ${total} 个 Context Package，第 1 页，共 ${totalPages} 页`);
        console.log('Packages:', packages);
        return { packages, total, totalPages };
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('获取 Context Package 列表失败:', error);
      throw error;
    }
  },

  /**
   * 示例：获取分析报告
   */
  async getAnalyticsExample() {
    try {
      const response = await getContextAnalytics({
        startTime: '2025-01-01T00:00:00Z',
        endTime: '2025-01-31T23:59:59Z',
        granularity: 'day',
      });

      if (response.success && response.data) {
        const {
          tokenUsageTrend,
          cacheHitRateTrend,
          compressionAnalysis,
          qualityAnalysis,
          topBlockTypes,
          performanceBottlenecks,
        } = response.data;
        console.log('Token 使用趋势:', tokenUsageTrend);
        console.log('缓存命中率趋势:', cacheHitRateTrend);
        console.log('压缩率分析:', compressionAnalysis);
        console.log('质量分布:', qualityAnalysis.distribution);
        console.log('Top Block Types:', topBlockTypes);
        console.log('性能瓶颈:', performanceBottlenecks);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Unknown error');
      }
    } catch (error) {
      console.error('获取分析报告失败:', error);
      throw error;
    }
  },
};
