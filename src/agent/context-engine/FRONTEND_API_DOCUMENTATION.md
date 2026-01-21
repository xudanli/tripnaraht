# Context API 前端接口文档

## 📋 概述

本文档是 **前端开发人员专用** 的 Context API 接口文档。

**重要说明**：
- ✅ **后台管理接口**（`/context/admin/*`）：供前端后台管理系统使用
- ❌ **智能体系统接口**（`/context/build`, `/context/compress` 等）：**前端不应直接调用**，这些是智能体系统内部接口

**Base URL**: `/api/context`

**认证**: 当前所有接口均为公开接口（`@Public()`），生产环境可能需要添加认证。

**响应格式**: 所有接口统一使用以下响应格式：

```typescript
{
  success: boolean;
  data?: T;           // 成功时返回数据
  error?: {           // 失败时返回错误信息
    code: string;
    message: string;
    details?: Record<string, any>;
  }
}
```

---

## 🎯 前端可用接口

### 1. GET /context/admin/metrics - Context 指标统计

**用途**: 后台管理系统展示 Context 使用情况的统计指标

**请求**:
```http
GET /api/context/admin/metrics?startTime=2025-01-01T00:00:00Z&endTime=2025-01-31T23:59:59Z&agent=PLANNER&phase=planning
```

**查询参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tripId | string | 否 | Trip ID 筛选 |
| phase | string | 否 | 规划阶段筛选（如：`planning`, `execution`） |
| agent | string | 否 | Agent 筛选（如：`PLANNER`, `GATEKEEPER`） |
| startTime | string | 否 | 开始时间（ISO 8601） |
| endTime | string | 否 | 结束时间（ISO 8601） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "timeRange": {
        "start": "2025-01-01T00:00:00Z",
        "end": "2025-01-31T23:59:59Z"
      },
      "totalRecords": 1000,
      "avgTokens": 3200,
      "avgCompressionRate": 0.15,
      "avgHitRate": 0.85,
      "avgNoiseRate": 0.12,
      "cacheHitRate": 0.65,
      "avgBuildTimeMs": 450,
      "qualityDistribution": {
        "EXCELLENT": 200,
        "GOOD": 500,
        "FAIR": 250,
        "POOR": 50
      },
      "topBlockTypes": [
        { "type": "WORLD_MODEL", "count": 1000 },
        { "type": "COUNTRY_VISA", "count": 950 },
        { "type": "PLAN_SUMMARY", "count": 800 }
      ]
    },
    "byAgent": {
      "PLANNER": {
        "count": 500,
        "avgTokens": 3500,
        "avgBuildTimeMs": 500,
        "cacheHitRate": 0.7
      },
      "GATEKEEPER": {
        "count": 300,
        "avgTokens": 2000,
        "avgBuildTimeMs": 300,
        "cacheHitRate": 0.6
      }
    },
    "byPhase": {
      "planning": {
        "count": 800,
        "avgTokens": 3000,
        "avgBuildTimeMs": 400,
        "cacheHitRate": 0.65
      },
      "execution": {
        "count": 200,
        "avgTokens": 2500,
        "avgBuildTimeMs": 350,
        "cacheHitRate": 0.7
      }
    }
  }
}
```

**TypeScript 类型**:

```typescript
interface GetContextMetricsResponse {
  summary: {
    timeRange: { start: string; end: string };
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
    topBlockTypes: Array<{ type: string; count: number }>;
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
```

---

### 2. GET /context/admin/packages - Context Package 列表

**用途**: 查看历史构建的 Context Package 列表

**请求**:
```http
GET /api/context/admin/packages?page=1&limit=20&phase=planning&agent=PLANNER&search=冰岛
```

**查询参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| page | number | 否 | 页码（默认 1） |
| limit | number | 否 | 每页数量（默认 20，最大 100） |
| tripId | string | 否 | Trip ID 筛选 |
| phase | string | 否 | 规划阶段筛选 |
| agent | string | 否 | Agent 筛选 |
| startTime | string | 否 | 开始时间（ISO 8601） |
| endTime | string | 否 | 结束时间（ISO 8601） |
| search | string | 否 | 搜索关键词（userQuery、tripId） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "packages": [
      {
        "id": "ctx_1768976716222_3hh37hc8z",
        "tripId": "trip-123",
        "phase": "planning",
        "agent": "PLANNER",
        "userQuery": "帮我规划冰岛7天行程",
        "blocksCount": 12,
        "totalTokens": 3200,
        "tokenBudget": 3600,
        "compressed": false,
        "createdAt": "2025-01-20T12:34:56Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

**TypeScript 类型**:

```typescript
interface GetContextPackagesResponse {
  packages: Array<{
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
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

### 3. GET /context/admin/packages/:id - Context Package 详情

**用途**: 查看特定 Context Package 的详细信息

**请求**:
```http
GET /api/context/admin/packages/ctx_1768976716222_3hh37hc8z
```

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| id | string | 是 | Context Package ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "package": {
      "id": "ctx_1768976716222_3hh37hc8z",
      "tripId": "trip-123",
      "phase": "planning",
      "agent": "PLANNER",
      "userQuery": "帮我规划冰岛7天行程",
      "blocks": [
        {
          "key": "world_model_summary",
          "type": "WORLD_MODEL",
          "text": "冰岛7天自驾行程，包含黄金圈、南岸、冰川等...",
          "priority": 90,
          "visibility": "public",
          "provenance": {
            "source": "skill",
            "identifier": "world.buildContext",
            "timestamp": "2025-01-20T12:34:56Z"
          },
          "estimatedTokens": 150
        }
      ],
      "totalTokens": 3200,
      "tokenBudget": 3600,
      "compressed": false,
      "createdAt": "2025-01-20T12:34:56Z",
      "metadata": {
        "originalBlocksCount": 15,
        "finalBlocksCount": 12
      }
    },
    "metrics": {
      "id": "metrics_123",
      "tripId": "trip-123",
      "phase": "planning",
      "agent": "PLANNER",
      "timestamp": "2025-01-20T12:34:56Z",
      "tokens": {
        "total": 3200,
        "budget": 3600,
        "overBudget": false,
        "overBudgetRate": 0.89
      },
      "blocks": {
        "total": 12,
        "public": 10,
        "private": 2,
        "compressed": false
      },
      "quality": {
        "hitRate": 0.85,
        "noiseRate": 0.12,
        "relevanceScore": 0.92,
        "quality": "EXCELLENT"
      },
      "performance": {
        "buildTimeMs": 450,
        "cacheHit": true,
        "skillsCalled": ["countryPack.getBlocks", "plan.selectSlices"]
      }
    }
  }
}
```

**TypeScript 类型**:

```typescript
interface GetContextPackageDetailResponse {
  package: ContextPackage;
  metrics?: ContextMetricsRecord;
}
```

---

### 4. GET /context/admin/analytics - Context 分析报告

**用途**: 生成 Context 使用分析报告

**请求**:
```http
GET /api/context/admin/analytics?startTime=2025-01-01T00:00:00Z&endTime=2025-01-31T23:59:59Z&granularity=day
```

**查询参数**:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| startTime | string | 否 | 开始时间（ISO 8601） |
| endTime | string | 否 | 结束时间（ISO 8601） |
| granularity | string | 否 | 时间粒度：`hour` / `day` / `week` / `month`（默认 `day`） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tokenUsageTrend": [
      {
        "timestamp": "2025-01-01T00:00:00Z",
        "avgTokens": 3200,
        "maxTokens": 5000,
        "minTokens": 2000,
        "count": 100
      }
    ],
    "cacheHitRateTrend": [
      {
        "timestamp": "2025-01-01T00:00:00Z",
        "cacheHitRate": 0.65,
        "count": 100
      }
    ],
    "compressionAnalysis": {
      "avgCompressionRate": 0.15,
      "compressionRateDistribution": [
        { "range": "0-20%", "count": 500 },
        { "range": "20-40%", "count": 300 },
        { "range": "40-60%", "count": 150 },
        { "range": "60-80%", "count": 40 },
        { "range": "80-100%", "count": 10 }
      ]
    },
    "qualityAnalysis": {
      "distribution": {
        "EXCELLENT": 200,
        "GOOD": 500,
        "FAIR": 250,
        "POOR": 50
      },
      "trend": [
        {
          "timestamp": "2025-01-01T00:00:00Z",
          "excellent": 20,
          "good": 50,
          "fair": 25,
          "poor": 5
        }
      ]
    },
    "topBlockTypes": [
      {
        "type": "WORLD_MODEL",
        "count": 1000,
        "avgTokens": 300
      },
      {
        "type": "COUNTRY_VISA",
        "count": 950,
        "avgTokens": 150
      }
    ],
    "performanceBottlenecks": [
      {
        "agent": "PLANNER",
        "phase": "planning",
        "avgBuildTimeMs": 500,
        "count": 500
      }
    ]
  }
}
```

**TypeScript 类型**:

```typescript
interface GetContextAnalyticsResponse {
  tokenUsageTrend: Array<{
    timestamp: string;
    avgTokens: number;
    maxTokens: number;
    minTokens: number;
    count: number;
  }>;
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
    count: number;
    avgTokens: number;
  }>;
  performanceBottlenecks: Array<{
    agent: string;
    phase: string;
    avgBuildTimeMs: number;
    count: number;
  }>;
}
```

---

## 📦 前端使用示例

### React/TypeScript 示例

```typescript
// api/context.ts
import axios from 'axios';

const API_BASE = '/api/context';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// 获取指标统计
export async function getContextMetrics(params?: {
  tripId?: string;
  phase?: string;
  agent?: string;
  startTime?: string;
  endTime?: string;
}): Promise<ApiResponse<GetContextMetricsResponse>> {
  const response = await axios.get(`${API_BASE}/admin/metrics`, { params });
  return response.data;
}

// 获取 Context Package 列表
export async function getContextPackages(params?: {
  page?: number;
  limit?: number;
  tripId?: string;
  phase?: string;
  agent?: string;
  startTime?: string;
  endTime?: string;
  search?: string;
}): Promise<ApiResponse<GetContextPackagesResponse>> {
  const response = await axios.get(`${API_BASE}/admin/packages`, { params });
  return response.data;
}

// 获取 Context Package 详情
export async function getContextPackageDetail(
  id: string
): Promise<ApiResponse<GetContextPackageDetailResponse>> {
  const response = await axios.get(`${API_BASE}/admin/packages/${id}`);
  return response.data;
}

// 获取分析报告
export async function getContextAnalytics(params?: {
  startTime?: string;
  endTime?: string;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}): Promise<ApiResponse<GetContextAnalyticsResponse>> {
  const response = await axios.get(`${API_BASE}/admin/analytics`, { params });
  return response.data;
}
```

### Vue 3 Composition API 示例

```typescript
// composables/useContext.ts
import { ref } from 'vue';
import { getContextMetrics, getContextPackages } from '@/api/context';

export function useContextMetrics() {
  const metrics = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const fetchMetrics = async (params?: any) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await getContextMetrics(params);
      if (response.success) {
        metrics.value = response.data;
      } else {
        error.value = response.error?.message;
      }
    } catch (err: any) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  };

  return {
    metrics,
    loading,
    error,
    fetchMetrics,
  };
}
```

### 使用示例

```typescript
// 在组件中使用
import { useContextMetrics } from '@/composables/useContext';

export default {
  setup() {
    const { metrics, loading, error, fetchMetrics } = useContextMetrics();

    // 获取指标统计
    fetchMetrics({
      startTime: '2025-01-01T00:00:00Z',
      endTime: '2025-01-31T23:59:59Z',
      agent: 'PLANNER',
    });

    return {
      metrics,
      loading,
      error,
    };
  },
};
```

---

## ⚠️ 注意事项

### 1. 接口分类

| 接口类型 | 路径 | 前端是否可用 |
|---------|------|------------|
| **后台管理接口** ✅ | `/context/admin/*` | ✅ **可用** |
| **智能体系统接口** ❌ | `/context/build`, `/context/compress` 等 | ❌ **不可用**（内部接口） |

### 2. 错误处理

所有接口都可能返回错误，前端需要处理错误情况：

```typescript
const response = await getContextMetrics();
if (!response.success) {
  console.error('获取指标失败:', response.error?.message);
  // 显示错误提示给用户
}
```

### 3. 分页处理

列表接口支持分页，前端需要处理分页逻辑：

```typescript
const [page, setPage] = useState(1);
const [limit] = useState(20);

const response = await getContextPackages({ page, limit });
if (response.success && response.data) {
  const { packages, total, totalPages } = response.data;
  // 显示列表和分页控件
}
```

### 4. 时间格式

所有时间参数使用 ISO 8601 格式：

```typescript
const startTime = new Date('2025-01-01').toISOString(); // "2025-01-01T00:00:00.000Z"
```

### 5. 性能优化

- 使用缓存减少重复请求
- 使用防抖/节流处理搜索输入
- 合理设置分页大小（建议 20-50）

---

## 🔗 相关文档

- [完整 API 文档](./API_DOCUMENTATION.md) - 包含所有接口（包括内部接口）
- [使用指南](./API_USAGE_GUIDE.md) - 接口定位和使用场景说明
- [TypeScript 类型定义](../dto/context-api.types.ts) - 完整的类型定义

---

## 📞 技术支持

如有问题或建议，请联系后端团队。

---

**最后更新**: 2025-01-21
