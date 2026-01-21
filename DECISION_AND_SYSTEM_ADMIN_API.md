# 决策日志管理和系统监控接口文档

**创建日期**: 2026-01-21  
**状态**: ✅ 已实现

---

## 一、决策日志管理接口

### 1.1 获取决策日志列表

**接口**: `GET /decision/admin/logs`

**说明**: 获取决策日志列表，支持分页、筛选、排序

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始，默认1 | 1 |
| `limit` | number | 否 | 每页数量，默认20，最大100 | 20 |
| `tripId` | string | 否 | 行程ID筛选 | uuid |
| `userId` | string | 否 | 用户ID筛选 | uuid |
| `persona` | string | 否 | Persona筛选：ABU, DR_DRE, NEPTUNE | ABU |
| `decisionSource` | string | 否 | 决策来源：PHYSICAL, HUMAN, PHILOSOPHY, HEURISTIC | PHYSICAL |
| `action` | string | 否 | 决策动作：ALLOW, REJECT, ADJUST, REPLACE | ALLOW |
| `startDate` | string | 否 | 开始日期（ISO 8601日期） | 2024-01-01 |
| `endDate` | string | 否 | 结束日期（ISO 8601日期） | 2024-12-31 |
| `sortBy` | string | 否 | 排序字段：timestamp | timestamp |
| `sortOrder` | string | 否 | 排序方向：asc, desc | desc |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "log-uuid",
        "tripId": "trip-uuid",
        "persona": "ABU",
        "action": "ALLOW",
        "explanation": "允许添加该景点，因为符合用户的体力水平",
        "reasonCodes": ["FITNESS_LEVEL_OK", "TIME_AVAILABLE"],
        "decisionSource": "PHYSICAL",
        "decisionStage": "FINALIZE",
        "timestamp": "2024-01-20T15:30:00Z",
        "countryCode": "JP",
        "routeDirectionId": "iceland_highlands_froad",
        "metadata": {}
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 500,
      "totalPages": 25
    }
  }
}
```

---

### 1.2 获取决策日志详情

**接口**: `GET /decision/admin/logs/:id`

**说明**: 获取单个决策日志的详细信息，包含所有关联数据

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 决策日志ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "log-uuid",
    "tripId": "trip-uuid",
    "countryCode": "JP",
    "routeDirectionId": "iceland_highlands_froad",
    "persona": "ABU",
    "action": "ALLOW",
    "decisionSource": "PHYSICAL",
    "decisionStage": "FINALIZE",
    "explanation": "允许添加该景点，因为符合用户的体力水平",
    "reasonCodes": ["FITNESS_LEVEL_OK", "TIME_AVAILABLE"],
    "evidenceRefs": [],
    "timestamp": "2024-01-20T15:30:00Z",
    "metadata": {},
    "outcomes": []
  }
}
```

---

### 1.3 获取决策统计

**接口**: `GET /decision/admin/stats`

**说明**: 获取决策统计信息，包括按国家、路线方向、Persona等维度的统计

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 统计开始日期（ISO 8601日期） | 2024-01-01 |
| `endDate` | string | 否 | 统计结束日期（ISO 8601日期） | 2024-12-31 |
| `countryCode` | string | 否 | 按国家筛选 | JP |
| `routeDirectionId` | string | 否 | 按路线方向筛选 | iceland_highlands_froad |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "distribution": {
      "totalDecisions": 1000,
      "bySource": {
        "PHYSICAL": 400,
        "HUMAN": 200,
        "PHILOSOPHY": 250,
        "HEURISTIC": 150
      },
      "bySourcePercentage": {
        "PHYSICAL": 0.4,
        "HUMAN": 0.2,
        "PHILOSOPHY": 0.25,
        "HEURISTIC": 0.15
      },
      "realityDrivenRatio": 0.6,
      "details": []
    },
    "personaStats": [
      {
        "persona": "ABU",
        "triggerCount": 500,
        "bySource": {
          "PHYSICAL": 300,
          "HUMAN": 100,
          "PHILOSOPHY": 80,
          "HEURISTIC": 20
        },
        "primarySource": "PHYSICAL"
      }
    ],
    "realityDrivenRatio": 0.6
  }
}
```

---

### 1.4 获取决策分析报告

**接口**: `GET /decision/admin/analytics`

**说明**: 获取决策质量分析报告，包括质量评分、HEURISTIC热点、拒绝原因分析等

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 开始日期（ISO 8601） | 2024-01-01T00:00:00Z |
| `endDate` | string | 否 | 结束日期（ISO 8601） | 2024-12-31T23:59:59Z |
| `countryCode` | string | 否 | 国家代码 | JP |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "qualityReport": {
      "overallScore": 0.85,
      "realityDrivenRatio": 0.6,
      "explanationQuality": 0.85,
      "decisionConsistency": 0.82
    },
    "heuristicHotspots": [
      {
        "countryCode": "IS",
        "routeDirectionId": "iceland_highlands_froad",
        "heuristicRatio": 0.45,
        "recommendation": "需要增加物理现实建模覆盖"
      }
    ],
    "rejectionReasons": [
      {
        "reason": "FITNESS_LEVEL_INSUFFICIENT",
        "count": 200,
        "percentage": 25.0
      }
    ],
    "replacementReasons": [
      {
        "reason": "WEATHER_CONDITION",
        "count": 80,
        "percentage": 40.0
      }
    ],
    "personaStats": [],
    "distribution": {}
  }
}
```

---

### 1.5 导出决策日志

**接口**: `POST /decision/admin/logs/export`

**说明**: 导出决策日志数据，支持JSON和CSV格式

**请求体**:

```json
{
  "format": "json",
  "filters": {
    "tripId": "trip-uuid",
    "persona": "ABU",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }
}
```

**响应示例** (JSON格式):

```json
{
  "success": true,
  "data": {
    "format": "json",
    "data": [...],
    "count": 100
  }
}
```

**响应示例** (CSV格式):

```json
{
  "success": true,
  "data": {
    "format": "csv",
    "content": "ID,Trip ID,Persona,Action,...",
    "filename": "decision-logs-2024-01-21.csv"
  }
}
```

---

## 二、系统监控补充接口

### 2.1 获取请求统计

**接口**: `GET /system/admin/requests`

**说明**: 获取API请求统计信息，包括请求量、端点统计、方法统计等

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startTime` | string | 否 | 开始时间（ISO 8601） | 2024-01-21T00:00:00Z |
| `endTime` | string | 否 | 结束时间（ISO 8601） | 2024-01-21T23:59:59Z |
| `granularity` | string | 否 | 时间粒度：hour, day | hour |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRequests": 100000,
      "requestsPerSecond": 50,
      "uniqueUsers": 5000,
      "uniqueIPs": 3000
    },
    "byEndpoint": [],
    "byMethod": {
      "GET": 60000,
      "POST": 30000,
      "PUT": 5000,
      "DELETE": 3000,
      "PATCH": 2000
    },
    "byStatus": {
      "2xx": 95000,
      "3xx": 2000,
      "4xx": 2500,
      "5xx": 500
    },
    "timeSeries": []
  }
}
```

---

### 2.2 获取数据库状态

**接口**: `GET /system/admin/database`

**说明**: 获取数据库连接池状态、查询统计、表信息等

**响应示例**:

```json
{
  "success": true,
  "data": {
    "connectionPool": {
      "size": 20,
      "active": 12,
      "idle": 8,
      "waiting": 0
    },
    "queries": {
      "total": 50000,
      "avgTime": 15,
      "slowQueries": 50,
      "slowQueryThreshold": 1000
    },
    "tables": {
      "total": 50,
      "largest": []
    },
    "health": {
      "status": "healthy",
      "lastCheck": "2024-01-21T10:30:00Z"
    }
  }
}
```

---

### 2.3 获取缓存状态

**接口**: `GET /system/admin/cache`

**说明**: 获取缓存系统状态，包括命中率、内存使用、操作统计等

**响应示例**:

```json
{
  "success": true,
  "data": {
    "status": "connected",
    "hitRate": 0.75,
    "missRate": 0.25,
    "totalKeys": 10000,
    "memoryUsage": {
      "used": 512,
      "max": 1024,
      "percentage": 50.0
    },
    "operations": {
      "hits": 75000,
      "misses": 25000,
      "sets": 10000,
      "deletes": 5000
    },
    "topKeys": [],
    "evictions": 0
  }
}
```

---

## 三、实现文件位置

### 决策日志管理
- **控制器**: `src/trips/decision/decision.controller.ts`
- **服务**: `src/trips/decision/services/decision-log-storage.service.ts`
- **DTO**: `src/trips/decision/dto/admin-decision.dto.ts`

### 系统监控
- **控制器**: `src/system/system.controller.ts`
- **服务**: `src/system/system.service.ts`

---

## 四、使用示例

### TypeScript/JavaScript

```typescript
// 获取决策日志列表
const response = await fetch('/api/decision/admin/logs?page=1&limit=20&persona=ABU');
const data = await response.json();

// 获取决策统计
const statsResponse = await fetch('/api/decision/admin/stats?countryCode=JP');
const stats = await statsResponse.json();

// 获取系统请求统计
const requestsResponse = await fetch('/api/system/admin/requests');
const requests = await requestsResponse.json();

// 获取数据库状态
const dbResponse = await fetch('/api/system/admin/database');
const dbStatus = await dbResponse.json();

// 获取缓存状态
const cacheResponse = await fetch('/api/system/admin/cache');
const cacheStatus = await cacheResponse.json();
```

---

## 五、注意事项

1. **权限控制**: 所有接口目前使用 `@Public()` 装饰器，生产环境需要改为权限验证
2. **数据量限制**: 导出接口最大支持10000条记录
3. **性能考虑**: 统计和分析接口可能涉及大量数据查询，建议添加缓存
4. **实时性**: 系统监控接口返回的是模拟数据，实际应该从监控系统获取实时数据
