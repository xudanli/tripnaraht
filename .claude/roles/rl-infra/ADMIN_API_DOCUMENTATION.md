# 后台管理系统 API 文档

> 更新时间: 2026-01-21

本文档描述了 TripNARA 后台管理系统的所有 API 端点，供管理后台前端和运维人员使用。

---

## 目录

- [一、Agent 管理接口](#一agent-管理接口)
  - [1.1 运行统计](#11-运行统计)
  - [1.2 性能分析](#12-性能分析)
  - [1.3 运行列表](#13-运行列表)
  - [1.4 运行详情](#14-运行详情)
  - [1.5 取消运行](#15-取消运行)
  - [1.6 Attempt 列表](#16-attempt-列表)
  - [1.7 Attempt 详情](#17-attempt-详情)
- [二、Context Engine 管理接口](#二context-engine-管理接口)
  - [2.1 Context 指标](#21-context-指标)
  - [2.2 Context Package 列表](#22-context-package-列表)
  - [2.3 Context Package 详情](#23-context-package-详情)
  - [2.4 Context 分析](#24-context-分析)
- [三、ROLL/训练管理接口](#三roll训练管理接口)
- [四、Decision 管理接口](#四decision-管理接口)

---

## 一、Agent 管理接口

基础路径: `/api/agent/admin`

### 1.1 运行统计

#### GET `/api/agent/admin/runs/stats`

获取 Agent 运行统计信息。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startDate | string | 否 | 开始日期 (ISO 8601) |
| endDate | string | 否 | 结束日期 (ISO 8601) |
| planningPhase | string | 否 | 规划阶段筛选 |

**示例请求:**

```
GET /api/agent/admin/runs/stats?startDate=2026-01-01&endDate=2026-01-21
```

**响应:**

```json
{
  "success": true,
  "data": {
    "totalRuns": 1250,
    "byStatus": {
      "COMPLETED": 1100,
      "IN_PROGRESS": 50,
      "FAILED": 100
    },
    "byPhase": {
      "INITIAL_PLANNING": 400,
      "REFINEMENT": 600,
      "FINALIZATION": 250
    },
    "averageDuration": 45000,
    "successRate": 0.88
  }
}
```

---

### 1.2 性能分析

#### GET `/api/agent/admin/performance`

获取 Agent 性能分析指标。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |

**响应:**

```json
{
  "success": true,
  "data": {
    "latency": {
      "avg": 45000,
      "p50": 35000,
      "p95": 120000,
      "p99": 180000,
      "min": 5000,
      "max": 300000
    },
    "throughput": {
      "requestsPerMinute": 12.5,
      "peakRequestsPerMinute": 25
    },
    "tokenUsage": {
      "avgInputTokens": 15000,
      "avgOutputTokens": 3000,
      "totalCost": 125.50
    },
    "errorRate": 0.08,
    "timeRange": {
      "start": "2026-01-01T00:00:00Z",
      "end": "2026-01-21T23:59:59Z"
    }
  }
}
```

---

### 1.3 运行列表

#### GET `/api/agent/admin/runs`

获取 Agent 运行列表，支持分页和筛选。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 (默认 1) |
| limit | number | 否 | 每页数量 (默认 20) |
| tripId | string | 否 | 按行程ID筛选 |
| userId | string | 否 | 按用户ID筛选 |
| status | string | 否 | 状态: IN_PROGRESS, COMPLETED, FAILED |
| planningPhase | string | 否 | 规划阶段 |
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |
| sortBy | string | 否 | 排序字段 (默认 createdAt) |
| sortOrder | string | 否 | 排序方向: asc, desc (默认 desc) |

**示例请求:**

```
GET /api/agent/admin/runs?page=1&limit=10&status=FAILED&sortBy=createdAt&sortOrder=desc
```

**响应:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "run_abc123",
        "tripId": "trip_xyz789",
        "userId": "user_456",
        "status": "FAILED",
        "planningPhase": "INITIAL_PLANNING",
        "errorMessage": "Token limit exceeded",
        "startedAt": "2026-01-20T10:00:00Z",
        "completedAt": "2026-01-20T10:05:00Z",
        "duration": 300000,
        "attemptCount": 3
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10
    }
  }
}
```

---

### 1.4 运行详情

#### GET `/api/agent/admin/runs/:id`

获取单个运行的详细信息。

**路径参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | TripRun ID |

**响应:**

```json
{
  "success": true,
  "data": {
    "id": "run_abc123",
    "tripId": "trip_xyz789",
    "userId": "user_456",
    "status": "COMPLETED",
    "planningPhase": "INITIAL_PLANNING",
    "startedAt": "2026-01-20T10:00:00Z",
    "completedAt": "2026-01-20T10:02:30Z",
    "duration": 150000,
    "tokenUsage": {
      "inputTokens": 18500,
      "outputTokens": 3200,
      "totalTokens": 21700,
      "estimatedCost": 0.15
    },
    "attempts": [
      {
        "id": "attempt_001",
        "status": "COMPLETED",
        "startedAt": "2026-01-20T10:00:00Z",
        "completedAt": "2026-01-20T10:02:30Z",
        "skillsInvoked": ["plan.generateSkeleton", "plan.addActivities"],
        "result": { "success": true }
      }
    ],
    "metadata": {
      "userQuery": "帮我规划一个东京5天的旅行",
      "modelVersion": "claude-3-opus"
    }
  }
}
```

**错误响应 (404):**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "运行 run_abc123 不存在"
  }
}
```

---

### 1.5 取消运行

#### POST `/api/agent/admin/runs/:id/cancel`

取消正在进行的运行。

**路径参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | TripRun ID |

**响应:**

```json
{
  "success": true,
  "data": {
    "cancelled": true,
    "runId": "run_abc123"
  }
}
```

---

### 1.6 Attempt 列表

#### GET `/api/agent/admin/attempts`

获取 Attempt 列表。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| limit | number | 否 | 每页数量 |
| tripRunId | string | 否 | 按 TripRun ID 筛选 |
| status | string | 否 | 状态: PENDING, IN_PROGRESS, COMPLETED, FAILED |
| sortBy | string | 否 | 排序字段 |
| sortOrder | string | 否 | 排序方向 |

**响应:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "attempt_001",
        "tripRunId": "run_abc123",
        "status": "COMPLETED",
        "startedAt": "2026-01-20T10:00:00Z",
        "completedAt": "2026-01-20T10:02:30Z",
        "skillsInvoked": ["plan.generateSkeleton"],
        "tokenUsage": {
          "inputTokens": 5000,
          "outputTokens": 1000
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

---

### 1.7 Attempt 详情

#### GET `/api/agent/admin/attempts/:id`

获取单个 Attempt 详情。

**路径参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | TripAttempt ID |

**响应:**

```json
{
  "success": true,
  "data": {
    "id": "attempt_001",
    "tripRunId": "run_abc123",
    "status": "COMPLETED",
    "startedAt": "2026-01-20T10:00:00Z",
    "completedAt": "2026-01-20T10:02:30Z",
    "skillsInvoked": [
      {
        "name": "plan.generateSkeleton",
        "duration": 25000,
        "result": "success"
      },
      {
        "name": "plan.addActivities",
        "duration": 45000,
        "result": "success"
      }
    ],
    "tokenUsage": {
      "inputTokens": 8500,
      "outputTokens": 1800,
      "breakdown": {
        "plan.generateSkeleton": { "input": 3000, "output": 800 },
        "plan.addActivities": { "input": 5500, "output": 1000 }
      }
    },
    "logs": [
      {
        "timestamp": "2026-01-20T10:00:05Z",
        "level": "INFO",
        "message": "Starting skeleton generation"
      }
    ]
  }
}
```

---

## 二、Context Engine 管理接口

基础路径: `/api/context/admin`

### 2.1 Context 指标

#### GET `/api/context/admin/metrics`

获取 Context Engine 监控指标。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |
| granularity | string | 否 | 粒度: hour, day, week |

**响应:**

```json
{
  "success": true,
  "data": {
    "buildRequests": {
      "total": 5000,
      "avgDuration": 250,
      "cacheHitRate": 0.75
    },
    "tokenUsage": {
      "totalTokens": 25000000,
      "avgTokensPerBuild": 5000,
      "compressionRatio": 0.65
    },
    "cacheStats": {
      "hits": 3750,
      "misses": 1250,
      "evictions": 500
    },
    "errors": {
      "total": 50,
      "byType": {
        "timeout": 30,
        "validation": 15,
        "other": 5
      }
    }
  }
}
```

---

### 2.2 Context Package 列表

#### GET `/api/context/admin/packages`

获取 Context Package 列表。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | number | 否 | 页码 |
| limit | number | 否 | 每页数量 |
| tripId | string | 否 | 按行程ID筛选 |
| phase | string | 否 | 按阶段筛选 |
| agent | string | 否 | 按 Agent 类型筛选 |
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |

**响应:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ctx_pkg_001",
        "tripId": "trip_xyz789",
        "phase": "INITIAL_PLANNING",
        "agent": "planning-assistant",
        "tokenCount": 4500,
        "blockCount": 12,
        "createdAt": "2026-01-20T10:00:00Z",
        "cached": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

### 2.3 Context Package 详情

#### GET `/api/context/admin/packages/:id`

获取单个 Context Package 详情。

**路径参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | Context Package ID |

**响应:**

```json
{
  "success": true,
  "data": {
    "id": "ctx_pkg_001",
    "tripId": "trip_xyz789",
    "phase": "INITIAL_PLANNING",
    "agent": "planning-assistant",
    "userQuery": "帮我规划东京5天旅行",
    "tokenBudget": 8000,
    "actualTokens": 4500,
    "blocks": [
      {
        "topic": "destination_info",
        "tokens": 1200,
        "priority": "high",
        "source": "countryPack"
      },
      {
        "topic": "user_preferences",
        "tokens": 800,
        "priority": "high",
        "source": "userProfile"
      }
    ],
    "metadata": {
      "buildDuration": 180,
      "cacheHit": false,
      "compressionApplied": true
    },
    "createdAt": "2026-01-20T10:00:00Z"
  }
}
```

---

### 2.4 Context 分析

#### GET `/api/context/admin/analytics`

获取 Context 使用分析。

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| startDate | string | 否 | 开始日期 |
| endDate | string | 否 | 结束日期 |
| groupBy | string | 否 | 分组: phase, agent, topic |

**响应:**

```json
{
  "success": true,
  "data": {
    "byPhase": {
      "INITIAL_PLANNING": {
        "count": 2000,
        "avgTokens": 5500,
        "avgDuration": 280
      },
      "REFINEMENT": {
        "count": 2500,
        "avgTokens": 4200,
        "avgDuration": 200
      }
    },
    "byAgent": {
      "planning-assistant": {
        "count": 3000,
        "avgTokens": 5000
      },
      "journey-assistant": {
        "count": 1500,
        "avgTokens": 3500
      }
    },
    "topTopics": [
      { "topic": "destination_info", "usageCount": 4500, "avgTokens": 1200 },
      { "topic": "user_preferences", "usageCount": 4200, "avgTokens": 800 },
      { "topic": "budget_constraints", "usageCount": 3800, "avgTokens": 600 }
    ],
    "trends": {
      "dailyBuilds": [
        { "date": "2026-01-19", "count": 450 },
        { "date": "2026-01-20", "count": 520 },
        { "date": "2026-01-21", "count": 480 }
      ]
    }
  }
}
```

---

## 三、ROLL/训练管理接口

详细文档请参见: [`ROLL_API_DOCUMENTATION.md`](./ROLL_API_DOCUMENTATION.md)

**接口概览:**

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/training/roll/metrics` | GET | ROLL 架构监控指标 |
| `/api/training/roll/workers/status` | GET | Workers 状态 |
| `/api/training/roll/health` | GET | 健康检查 |
| `/api/training/roll/ab-test/create` | POST | 创建 A/B 测试实验 |
| `/api/training/roll/ab-test/analyze` | POST | 分析 A/B 测试结果 |
| `/api/training/roll/ab-test/should-use` | GET | 检查是否使用 ROLL |

---

## 四、Decision 管理接口

基础路径: `/api/decision-stats`

### GET `/api/decision-stats/overview`

获取决策统计概览。

### GET `/api/decision-stats/by-type`

按类型获取决策统计。

### GET `/api/decision-stats/trends`

获取决策趋势数据。

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| SUCCESS | 200 | 成功 |
| BAD_REQUEST | 400 | 请求参数错误 |
| UNAUTHORIZED | 401 | 未授权 |
| FORBIDDEN | 403 | 禁止访问 |
| NOT_FOUND | 404 | 资源不存在 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

## 认证说明

> ⚠️ **注意**: 当前管理接口使用 `@Public()` 装饰器临时开放，生产环境应添加适当的认证和授权机制。

建议的认证方式:
1. JWT Token 认证
2. API Key 认证
3. RBAC 权限控制

---

*文档由 rl-infra 团队维护*
