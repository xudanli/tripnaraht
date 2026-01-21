// src/agent/context-engine/dto/frontend-context-api.types.ts
/**
 * Context API 前端 TypeScript 类型定义
 * 
 * 前端可直接导入使用这些类型定义
 * 只包含前端可用的后台管理接口类型
 */

/**
 * 统一响应格式
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * Context 指标统计响应
 */
export interface GetContextMetricsResponse {
  summary: {
    timeRange: {
      start: string;
      end: string;
    };
    totalRecords: number;
    avgTokens: number;
    avgCompressionRate: number;
    avgHitRate?: number;
    avgNoiseRate: number;
    cacheHitRate: number;
    avgBuildTimeMs: number;
    qualityDistribution: {
      EXCELLENT: number;
      GOOD: number;
      FAIR: number;
      POOR: number;
    };
    topBlockTypes: Array<{
      type: string;
      count: number;
    }>;
  };
  byAgent: Record<string, {
    count: number;
    avgTokens: number;
    avgBuildTimeMs: number;
    cacheHitRate: number;
  }>;
  byPhase: Record<string, {
    count: number;
    avgTokens: number;
    avgBuildTimeMs: number;
    cacheHitRate: number;
  }>;
}

/**
 * Context Package 列表项
 */
export interface ContextPackageListItem {
  id: string;
  tripId?: string;
  phase: string;
  agent: string;
  userQuery: string;
  blocksCount: number;
  totalTokens: number;
  tokenBudget: number;
  compressed: boolean;
  createdAt: string;
}

/**
 * Context Package 列表响应
 */
export interface GetContextPackagesResponse {
  packages: ContextPackageListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Context Block
 */
export interface ContextBlock {
  key: string;
  type: string;
  text: string;
  data?: Record<string, any>;
  priority: number;
  visibility: 'public' | 'private';
  provenance: {
    source: string;
    identifier: string;
    version?: string;
    timestamp: string;
  };
  estimatedTokens?: number;
}

/**
 * Context Package
 */
export interface ContextPackage {
  id: string;
  tripId?: string;
  phase: string;
  agent: string;
  userQuery: string;
  blocks: ContextBlock[];
  totalTokens: number;
  tokenBudget: number;
  compressed: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Context Metrics Record
 */
export interface ContextMetricsRecord {
  id: string;
  tripId?: string;
  phase: string;
  agent: string;
  timestamp: string;
  tokens: {
    total: number;
    budget: number;
    overBudget: boolean;
    overBudgetRate: number;
  };
  blocks: {
    total: number;
    public: number;
    private: number;
    compressed: boolean;
    compressionRate?: number;
  };
  quality: {
    hitRate?: number;
    noiseRate: number;
    relevanceScore?: number;
    quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  };
  performance: {
    buildTimeMs: number;
    cacheHit: boolean;
    skillsCalled: string[];
  };
  blockTypeDistribution: Record<string, number>;
  priorityDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Context Package 详情响应
 */
export interface GetContextPackageDetailResponse {
  package: ContextPackage;
  metrics?: ContextMetricsRecord;
}

/**
 * Token 使用趋势数据点
 */
export interface TokenUsageTrendPoint {
  timestamp: string;
  avgTokens: number;
  maxTokens: number;
  minTokens: number;
  count: number;
}

/**
 * Context 分析报告响应
 */
export interface GetContextAnalyticsResponse {
  tokenUsageTrend: TokenUsageTrendPoint[];
  cacheHitRateTrend: Array<{
    timestamp: string;
    cacheHitRate: number;
    count: number;
  }>;
  compressionAnalysis: {
    avgCompressionRate: number;
    compressionRateDistribution: Array<{
      range: string;
      count: number;
    }>;
  };
  qualityAnalysis: {
    distribution: Record<string, number>;
    trend: Array<{
      timestamp: string;
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    }>;
  };
  topBlockTypes: Array<{
    type: string;
    avgTokens: number;
    count: number;
  }>;
  performanceBottlenecks: Array<{
    agent: string;
    phase: string;
    avgBuildTimeMs: number;
    count: number;
  }>;
}

/**
 * 查询参数类型
 */
export interface GetContextMetricsQuery {
  tripId?: string;
  phase?: string;
  agent?: string;
  startTime?: string;
  endTime?: string;
}

export interface GetContextPackagesQuery {
  page?: number;
  limit?: number;
  tripId?: string;
  phase?: string;
  agent?: string;
  startTime?: string;
  endTime?: string;
  search?: string;
}

export interface GetContextAnalyticsQuery {
  startTime?: string;
  endTime?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}
