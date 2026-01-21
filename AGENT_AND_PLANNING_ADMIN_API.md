# Agent 运行管理和规划工作台管理接口文档

**创建日期**: 2026-01-21  
**状态**: ✅ 已实现

---

## 一、Agent 运行管理接口

### 1.1 获取 Agent 运行列表

**接口**: `GET /agent/admin/runs`

**说明**: 获取 TripRun 列表，支持分页、筛选、排序

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始，默认1 | 1 |
| `limit` | number | 否 | 每页数量，默认20，最大100 | 20 |
| `tripId` | string | 否 | 行程ID筛选 | uuid |
| `userId` | string | 否 | 用户ID筛选 | uuid |
| `status` | string | 否 | 状态筛选：IN_PROGRESS, COMPLETED, FAILED | IN_PROGRESS |
| `planningPhase` | string | 否 | 规划阶段筛选 | planning |
| `startDate` | string | 否 | 开始日期（ISO 8601） | 2024-01-01T00:00:00Z |
| `endDate` | string | 否 | 结束日期（ISO 8601） | 2024-12-31T23:59:59Z |
| `sortBy` | string | 否 | 排序字段 | createdAt |
| `sortOrder` | string | 否 | 排序方向：asc, desc | desc |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "run-uuid",
        "tripId": "trip-uuid",
        "userId": "user-uuid",
        "userQuery": "规划一个5天的日本行程",
        "planningPhase": "planning",
        "currentAgent": "PLANNER",
        "status": "COMPLETED",
        "createdAt": "2024-01-20T10:00:00Z",
        "updatedAt": "2024-01-20T10:05:00Z",
        "completedAt": "2024-01-20T10:05:00Z",
        "duration": 300,
        "latestAttempt": {
          "id": "attempt-uuid",
          "attemptNumber": 1,
          "status": "COMPLETED",
          "createdAt": "2024-01-20T10:00:00Z"
        }
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

### 1.2 获取 Agent 运行详情

**接口**: `GET /agent/admin/runs/:id`

**说明**: 获取单个 TripRun 的详细信息，包含所有关联的 TripAttempt

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | TripRun ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "run-uuid",
    "tripId": "trip-uuid",
    "userId": "user-uuid",
    "userQuery": "规划一个5天的日本行程",
    "planningPhase": "planning",
    "currentAgent": "PLANNER",
    "status": "COMPLETED",
    "createdAt": "2024-01-20T10:00:00Z",
    "updatedAt": "2024-01-20T10:05:00Z",
    "completedAt": "2024-01-20T10:05:00Z",
    "duration": 300,
    "metadata": {},
    "attempts": [
      {
        "id": "attempt-uuid",
        "attemptNumber": 1,
        "planOutline": "生成行程骨架...",
        "openQuestions": [],
        "constraintsAssumed": [],
        "nextActions": [],
        "failureNotes": null,
        "status": "COMPLETED",
        "resultSummary": "成功生成行程",
        "artifacts": {},
        "createdAt": "2024-01-20T10:00:00Z",
        "updatedAt": "2024-01-20T10:05:00Z",
        "completedAt": "2024-01-20T10:05:00Z",
        "metadata": {},
        "duration": 300
      }
    ]
  }
}
```

---

### 1.3 获取 Agent 运行统计

**接口**: `GET /agent/admin/runs/stats`

**说明**: 获取 TripRun 的统计信息，包括按状态、阶段的统计

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 开始日期（ISO 8601） | 2024-01-01T00:00:00Z |
| `endDate` | string | 否 | 结束日期（ISO 8601） | 2024-12-31T23:59:59Z |
| `planningPhase` | string | 否 | 规划阶段筛选 | planning |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRuns": 1000,
      "completedRuns": 800,
      "failedRuns": 100,
      "inProgressRuns": 100,
      "successRate": 0.8,
      "avgDuration": 300
    },
    "byStatus": [
      {
        "status": "COMPLETED",
        "count": 800,
        "percentage": 80.0
      },
      {
        "status": "FAILED",
        "count": 100,
        "percentage": 10.0
      },
      {
        "status": "IN_PROGRESS",
        "count": 100,
        "percentage": 10.0
      }
    ],
    "byPhase": [
      {
        "phase": "planning",
        "count": 600,
        "percentage": 60.0
      }
    ]
  }
}
```

---

### 1.4 获取 Attempt 列表

**接口**: `GET /agent/admin/attempts`

**说明**: 获取 TripAttempt 列表，支持分页、筛选

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始 | 1 |
| `limit` | number | 否 | 每页数量，默认20，最大100 | 20 |
| `tripRunId` | string | 否 | TripRun ID筛选 | uuid |
| `status` | string | 否 | 状态筛选：PENDING, IN_PROGRESS, COMPLETED, FAILED | COMPLETED |
| `sortBy` | string | 否 | 排序字段 | createdAt |
| `sortOrder` | string | 否 | 排序方向：asc, desc | desc |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "attempt-uuid",
        "tripRunId": "run-uuid",
        "attemptNumber": 1,
        "planOutline": "生成行程骨架...",
        "status": "COMPLETED",
        "createdAt": "2024-01-20T10:00:00Z",
        "run": {
          "id": "run-uuid",
          "tripId": "trip-uuid",
          "userId": "user-uuid",
          "userQuery": "规划一个5天的日本行程",
          "planningPhase": "planning"
        },
        "duration": 300
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

### 1.5 获取 Attempt 详情

**接口**: `GET /agent/admin/attempts/:id`

**说明**: 获取单个 TripAttempt 的详细信息

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | TripAttempt ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "attempt-uuid",
    "tripRunId": "run-uuid",
    "attemptNumber": 1,
    "planOutline": "生成行程骨架...",
    "openQuestions": [],
    "constraintsAssumed": [],
    "nextActions": [],
    "failureNotes": null,
    "status": "COMPLETED",
    "resultSummary": "成功生成行程",
    "artifacts": {},
    "createdAt": "2024-01-20T10:00:00Z",
    "updatedAt": "2024-01-20T10:05:00Z",
    "completedAt": "2024-01-20T10:05:00Z",
    "metadata": {},
    "run": {
      "id": "run-uuid",
      "tripId": "trip-uuid",
      "userId": "user-uuid",
      "userQuery": "规划一个5天的日本行程",
      "planningPhase": "planning",
      "currentAgent": "PLANNER",
      "status": "COMPLETED",
      "createdAt": "2024-01-20T10:00:00Z"
    },
    "duration": 300
  }
}
```

---

### 1.6 取消运行

**接口**: `POST /agent/admin/runs/:id/cancel`

**说明**: 取消指定的 TripRun，将其状态设置为 FAILED

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | TripRun ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "cancelled": true,
    "runId": "run-uuid"
  }
}
```

---

### 1.7 获取 Agent 性能分析

**接口**: `GET /agent/admin/performance`

**说明**: 获取 Agent 运行的性能分析，包括平均耗时、P50/P95/P99等指标

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 开始日期（ISO 8601） | 2024-01-01T00:00:00Z |
| `endDate` | string | 否 | 结束日期（ISO 8601） | 2024-12-31T23:59:59Z |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "avgDuration": 300,
    "p50Duration": 250,
    "p95Duration": 500,
    "p99Duration": 800,
    "minDuration": 100,
    "maxDuration": 1200,
    "totalRuns": 1000
  }
}
```

---

## 二、规划工作台管理接口

### 2.1 获取规划会话列表

**接口**: `GET /planning-workbench/admin/sessions`

**说明**: 获取规划会话列表（基于 PlanningPlan），支持分页、筛选

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始 | 1 |
| `limit` | number | 否 | 每页数量，默认20，最大100 | 20 |
| `tripId` | string | 否 | 行程ID筛选 | uuid |
| `userId` | string | 否 | 用户ID筛选 | uuid |
| `status` | string | 否 | 状态筛选：DRAFT, PROPOSED, NEED_CONFIRM, LOCKED | DRAFT |
| `startDate` | string | 否 | 开始日期（ISO 8601） | 2024-01-01T00:00:00Z |
| `endDate` | string | 否 | 结束日期（ISO 8601） | 2024-12-31T23:59:59Z |
| `sortBy` | string | 否 | 排序字段 | createdAt |
| `sortOrder` | string | 否 | 排序方向：asc, desc | desc |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "plan-uuid",
        "tripId": "trip-uuid",
        "planVersion": 1,
        "status": "LOCKED",
        "summary": {
          "itemCount": 25,
          "days": 5,
          "budget": 20000
        },
        "createdAt": "2024-01-20T10:00:00Z",
        "updatedAt": "2024-01-20T10:05:00Z",
        "createdBy": "system",
        "trip": {
          "id": "trip-uuid",
          "destination": "JP",
          "startDate": "2024-05-01T00:00:00Z",
          "endDate": "2024-05-05T00:00:00Z",
          "status": "PLANNING",
          "collaborators": [
            {
              "userId": "user-uuid",
              "role": "OWNER"
            }
          ]
        }
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

### 2.2 获取规划会话详情

**接口**: `GET /planning-workbench/admin/sessions/:id`

**说明**: 获取单个规划会话的详细信息，包含所有交互历史

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 会话ID（PlanningPlan ID） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "plan-uuid",
    "tripId": "trip-uuid",
    "planVersion": 1,
    "status": "LOCKED",
    "planState": {
      "plan_id": "plan-uuid",
      "plan_version": 1,
      "constraints": {},
      "itinerary": {},
      "mobility": {},
      "budget": {},
      "pace": {},
      "gate": {},
      "status": "LOCKED"
    },
    "uiOutput": {},
    "summary": {
      "itemCount": 25,
      "days": 5,
      "budget": 20000
    },
    "createdAt": "2024-01-20T10:00:00Z",
    "updatedAt": "2024-01-20T10:05:00Z",
    "createdBy": "system",
    "trip": {
      "id": "trip-uuid",
      "destination": "JP",
      "startDate": "2024-05-01T00:00:00Z",
      "endDate": "2024-05-05T00:00:00Z",
      "status": "PLANNING",
      "collaborators": []
    }
  }
}
```

---

### 2.3 获取会话统计

**接口**: `GET /planning-workbench/admin/sessions/stats`

**说明**: 获取规划会话的统计信息，包括成功率、平均时长等

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 开始日期（ISO 8601） | 2024-01-01T00:00:00Z |
| `endDate` | string | 否 | 结束日期（ISO 8601） | 2024-12-31T23:59:59Z |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalSessions": 1000,
      "lockedSessions": 800,
      "draftSessions": 100,
      "proposedSessions": 50,
      "needConfirmSessions": 50,
      "successRate": 0.8,
      "avgDuration": 300
    },
    "byStatus": [
      {
        "status": "LOCKED",
        "count": 800,
        "percentage": 80.0
      },
      {
        "status": "DRAFT",
        "count": 100,
        "percentage": 10.0
      }
    ]
  }
}
```

---

### 2.4 获取规划方案列表

**接口**: `GET /planning-workbench/admin/plans`

**说明**: 获取规划方案列表，支持分页、筛选

**请求参数**: 类似 `/planning-workbench/admin/sessions`

---

### 2.5 获取规划方案详情

**接口**: `GET /planning-workbench/admin/plans/:id`

**说明**: 获取单个规划方案的详细信息

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 方案ID（PlanningPlan ID） |

---

## 三、实现文件位置

### Agent 运行管理
- **控制器**: `src/agent/agent-admin.controller.ts`
- **服务**: `src/agent/services/agent-run-admin.service.ts`

### 规划工作台管理
- **控制器**: `src/agent/planning-workbench.controller.ts` (已添加 admin 接口)
- **服务**: `src/agent/services/planning-workbench-admin.service.ts`

---

## 四、使用示例

### TypeScript/JavaScript

```typescript
// 获取 Agent 运行列表
const runsResponse = await fetch('/api/agent/admin/runs?page=1&limit=20&status=COMPLETED');
const runs = await runsResponse.json();

// 获取运行详情
const runDetailResponse = await fetch('/api/agent/admin/runs/run-uuid');
const runDetail = await runDetailResponse.json();

// 获取运行统计
const statsResponse = await fetch('/api/agent/admin/runs/stats');
const stats = await statsResponse.json();

// 获取规划会话列表
const sessionsResponse = await fetch('/api/planning-workbench/admin/sessions?page=1&limit=20');
const sessions = await sessionsResponse.json();

// 获取会话详情
const sessionDetailResponse = await fetch('/api/planning-workbench/admin/sessions/session-uuid');
const sessionDetail = await sessionDetailResponse.json();
```

---

## 五、注意事项

1. **权限控制**: 所有接口目前使用 `@Public()` 装饰器，生产环境需要改为权限验证
2. **数据关联**: 部分接口需要通过 Trip 关联查询用户信息
3. **性能考虑**: 统计和分析接口可能涉及大量数据查询，建议添加缓存
4. **实时性**: 运行状态需要实时更新，建议使用 WebSocket 或轮询机制
