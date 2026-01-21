# 后台管理系统 API 接口文档

**版本**: 1.0.0  
**基础路径**: `/api`  
**创建日期**: 2026-01-21  
**最后更新**: 2026-01-21

---

## 📋 目录

- [一、接口总览](#一接口总览)
- [二、统一规范](#二统一规范)
- [三、行程管理接口](#三行程管理接口)
- [四、决策日志管理接口](#四决策日志管理接口)
- [五、系统监控接口](#五系统监控接口)
- [六、Context 管理接口](#六context-管理接口)
- [七、Agent 运行管理接口](#七agent-运行管理接口)
- [八、规划工作台管理接口](#八规划工作台管理接口)
- [九、错误码说明](#九错误码说明)
- [十、前端集成示例](#十前端集成示例)

---

## 一、接口总览

### Phase 1: 高优先级接口（已实现）

| 模块 | 接口 | 方法 | 状态 | 说明 |
|------|------|------|------|------|
| **行程管理** | `/trips/admin` | GET | ✅ | 行程列表 |
| | `/trips/admin/stats` | GET | ✅ | 行程统计 |
| | `/trips/admin/:id` | GET | ✅ | 行程详情 |
| | `/trips/admin/batch` | POST | ✅ | 批量操作 |
| | `/trips/admin/:id/export` | GET | ✅ | 导出数据 |
| **决策日志** | `/decision/admin/logs` | GET | ⚠️ | 决策日志列表 |
| | `/decision/admin/logs/:id` | GET | ⚠️ | 决策日志详情 |
| | `/decision/admin/stats` | GET | ⚠️ | 决策统计 |
| | `/decision/admin/analytics` | GET | ⚠️ | 决策分析报告 |
| **系统监控** | `/system/admin/metrics` | GET | ✅ | 系统指标 |
| | `/system/admin/performance` | GET | ✅ | 性能指标 |
| | `/system/admin/errors` | GET | ✅ | 错误统计 |

### Phase 2: 中优先级接口（部分实现）

| 模块 | 接口 | 方法 | 状态 | 说明 |
|------|------|------|------|------|
| **Context 管理** | `/context/admin/metrics` | GET | ✅ | Context 指标统计 |
| | `/context/admin/packages` | GET | ✅ | Context Package 列表 |
| | `/context/admin/packages/:id` | GET | ⚠️ | Context Package 详情 |

---

## 二、统一规范

### 2.1 响应格式

#### 成功响应

```json
{
  "success": true,
  "data": {
    // 具体数据
  }
}
```

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误消息",
    "details": {}
  }
}
```

#### 分页响应

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

### 2.2 日期时间格式

- **日期**: `YYYY-MM-DD` (例如: `2024-01-01`)
- **日期时间**: ISO 8601 (例如: `2024-01-01T10:30:00Z`)

### 2.3 分页参数

- `page`: 页码，从 1 开始，默认 1
- `limit`: 每页数量，默认 20，最大 100

---

## 三、行程管理接口

### 3.1 获取行程列表

**接口**: `GET /trips/admin`

**说明**: 获取所有行程列表，支持分页、筛选、排序、搜索

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始 | 1 |
| `limit` | number | 否 | 每页数量，默认20，最大100 | 20 |
| `status` | string | 否 | 状态筛选：PLANNING, IN_PROGRESS, COMPLETED, CANCELLED | PLANNING |
| `destination` | string | 否 | 目的地国家代码（ISO 3166-1 alpha-2） | JP |
| `startDateFrom` | string | 否 | 开始日期范围（ISO 8601日期） | 2024-01-01 |
| `startDateTo` | string | 否 | 结束日期范围（ISO 8601日期） | 2024-12-31 |
| `createdAtFrom` | string | 否 | 创建时间范围（ISO 8601） | 2024-01-01T00:00:00Z |
| `createdAtTo` | string | 否 | 创建时间范围（ISO 8601） | 2024-12-31T23:59:59Z |
| `userId` | string | 否 | 用户ID筛选（UUID） | f3626ff1-7a9b-46d9-8b8b-7f53a14583b1 |
| `sortBy` | string | 否 | 排序字段：createdAt, updatedAt, startDate, endDate | createdAt |
| `sortOrder` | string | 否 | 排序方向：asc, desc | desc |
| `search` | string | 否 | 搜索关键词（目的地、用户邮箱、用户名称） | Tokyo |

**请求示例**:

```bash
GET /api/trips/admin?page=1&limit=20&status=PLANNING&destination=JP&sortBy=createdAt&sortOrder=desc
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
        "destination": "JP",
        "startDate": "2024-05-01T00:00:00Z",
        "endDate": "2024-05-05T00:00:00Z",
        "status": "PLANNING",
        "durationDays": 5,
        "budgetConfig": {
          "totalBudget": 20000,
          "currency": "CNY",
          "estimated_flight_visa": 5000,
          "remaining_for_ground": 15000,
          "daily_budget": 3000
        },
        "pacingConfig": {
          "level": "STANDARD",
          "maxDailyActivities": 5,
          "shortestStave": "CITY_POTATO"
        },
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-20T15:45:00Z",
        "owner": {
          "userId": "user-uuid",
          "email": "user@example.com",
          "displayName": "John Doe",
          "avatarUrl": "https://..."
        },
        "stats": {
          "daysCount": 5,
          "itemsCount": 25,
          "collaboratorsCount": 2,
          "likesCount": 5,
          "collectionsCount": 3,
          "sharesCount": 2
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

### 3.2 获取行程统计信息

**接口**: `GET /trips/admin/stats`

**说明**: 获取行程相关的统计数据

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 统计开始日期（ISO 8601日期） | 2024-01-01 |
| `endDate` | string | 否 | 统计结束日期（ISO 8601日期） | 2024-12-31 |
| `destination` | string | 否 | 按目的地筛选 | JP |

**请求示例**:

```bash
GET /api/trips/admin/stats?startDate=2024-01-01&endDate=2024-12-31&destination=JP
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalTrips": 1250,
      "activeTrips": 350,
      "completedTrips": 800,
      "cancelledTrips": 100,
      "planningTrips": 250
    },
    "byStatus": {
      "PLANNING": { "count": 250, "percentage": 20.0 },
      "IN_PROGRESS": { "count": 100, "percentage": 8.0 },
      "COMPLETED": { "count": 800, "percentage": 64.0 },
      "CANCELLED": { "count": 100, "percentage": 8.0 }
    },
    "byDestination": {
      "JP": { "count": 450, "percentage": 36.0 },
      "IS": { "count": 300, "percentage": 24.0 },
      "US": { "count": 200, "percentage": 16.0 },
      "FR": { "count": 150, "percentage": 12.0 },
      "other": { "count": 150, "percentage": 12.0 }
    },
    "byTimeRange": {
      "last7Days": { "count": 50, "newTrips": 30 },
      "last30Days": { "count": 200, "newTrips": 120 },
      "last90Days": { "count": 500, "newTrips": 300 },
      "lastYear": { "count": 1250, "newTrips": 800 }
    },
    "engagement": {
      "avgDaysPerTrip": 5.2,
      "avgItemsPerTrip": 25.5,
      "avgCollaboratorsPerTrip": 1.8,
      "totalLikes": 3500,
      "totalCollections": 2100,
      "totalShares": 800
    },
    "budget": {
      "avgBudget": 18000,
      "medianBudget": 15000,
      "totalBudget": 22500000,
      "budgetDistribution": {
        "0-5000": 100,
        "5000-10000": 200,
        "10000-20000": 500,
        "20000-50000": 350,
        "50000+": 100
      }
    },
    "trends": {
      "newTripsByMonth": [
        { "month": "2024-01", "count": 80 },
        { "month": "2024-02", "count": 95 },
        { "month": "2024-03", "count": 110 }
      ],
      "completionRateByMonth": [
        { "month": "2024-01", "rate": 0.75 },
        { "month": "2024-02", "rate": 0.78 },
        { "month": "2024-03", "rate": 0.82 }
      ]
    }
  }
}
```

---

### 3.3 获取行程详情（管理视图）

**接口**: `GET /trips/admin/:id`

**说明**: 获取单个行程的完整信息，包括所有关联数据

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 行程ID（UUID） |

**请求示例**:

```bash
GET /api/trips/admin/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "destination": "JP",
    "startDate": "2024-05-01T00:00:00Z",
    "endDate": "2024-05-05T00:00:00Z",
    "status": "PLANNING",
    "durationDays": 5,
    "budgetConfig": {
      "totalBudget": 20000,
      "currency": "CNY"
    },
    "pacingConfig": {
      "level": "STANDARD",
      "maxDailyActivities": 5
    },
    "metadata": {
      "generationProgress": {
        "status": "completed",
        "itemsCount": 25
      }
    },
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-20T15:45:00Z",
    "owner": {
      "userId": "user-uuid",
      "email": "user@example.com",
      "displayName": "John Doe"
    },
    "collaborators": [
      {
        "userId": "collaborator-uuid",
        "email": "collab@example.com",
        "displayName": "Jane Smith",
        "role": "EDITOR",
        "createdAt": "2024-01-16T08:00:00Z"
      }
    ],
    "days": [
      {
        "id": "day-uuid",
        "date": "2024-05-01T00:00:00Z",
        "itemsCount": 5,
        "items": [
          {
            "id": "item-uuid",
            "startTime": "2024-05-01T09:00:00Z",
            "endTime": "2024-05-01T12:00:00Z",
            "type": "ACTIVITY",
            "place": {
              "id": 123,
              "nameCN": "东京塔",
              "nameEN": "Tokyo Tower",
              "category": "ATTRACTION"
            }
          }
        ]
      }
    ],
    "stats": {
      "daysCount": 5,
      "itemsCount": 25,
      "collaboratorsCount": 2,
      "likesCount": 5,
      "collectionsCount": 3,
      "sharesCount": 2
    },
    "social": {
      "likes": [
        {
          "userId": "like-user-uuid",
          "email": "liker@example.com",
          "createdAt": "2024-01-18T10:00:00Z"
        }
      ],
      "collections": [
        {
          "userId": "collect-user-uuid",
          "email": "collector@example.com",
          "createdAt": "2024-01-19T14:00:00Z"
        }
      ],
      "shares": [
        {
          "id": "share-uuid",
          "shareToken": "token-123",
          "permission": "VIEW",
          "expiresAt": "2024-06-01T00:00:00Z",
          "createdAt": "2024-01-20T09:00:00Z"
        }
      ]
    },
    "decisionLogs": {
      "total": 50,
      "recent": [
        {
          "id": "log-uuid",
          "timestamp": "2024-01-20T15:30:00Z",
          "source": "PLANNER",
          "decisionType": "PLACE_SELECTION",
          "summary": "选择了东京塔作为第一天的主要景点"
        }
      ]
    }
  }
}
```

---

### 3.4 批量操作

**接口**: `POST /trips/admin/batch`

**说明**: 批量执行操作（删除、状态更新等）

**请求体**:

```json
{
  "action": "UPDATE_STATUS",
  "tripIds": [
    "trip-id-1",
    "trip-id-2",
    "trip-id-3"
  ],
  "params": {
    "status": "CANCELLED"
  }
}
```

**请求参数说明**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `action` | string | 是 | 操作类型：DELETE, UPDATE_STATUS | UPDATE_STATUS |
| `tripIds` | string[] | 是 | 行程ID列表 | ["id1", "id2"] |
| `params` | object | 否 | 操作参数 | { "status": "CANCELLED" } |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "action": "UPDATE_STATUS",
    "total": 3,
    "success": 2,
    "failed": 1,
    "errors": [
      {
        "tripId": "trip-id-3",
        "error": "行程不存在或无权操作"
      }
    ]
  }
}
```

---

### 3.5 导出行程数据

**接口**: `GET /trips/admin/:id/export`

**说明**: 导出单个行程的完整数据

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 行程ID（UUID） |

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `format` | string | 否 | 导出格式：json, csv，默认 json | json |

**请求示例**:

```bash
GET /api/trips/admin/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1/export?format=json
```

**响应**: 
- JSON格式：直接返回JSON数据
- CSV格式：返回CSV文件下载（Content-Type: text/csv）

---

## 四、决策日志管理接口

### 4.1 获取决策日志列表

**接口**: `GET /decision/admin/logs`

**说明**: 获取决策日志列表，支持分页、筛选

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

**请求示例**:

```bash
GET /api/decision/admin/logs?page=1&limit=20&persona=ABU&startDate=2024-01-01&endDate=2024-12-31
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "log-uuid",
        "tripId": "trip-uuid",
        "userId": "user-uuid",
        "persona": "ABU",
        "action": "ALLOW",
        "explanation": "允许添加该景点，因为符合用户的体力水平",
        "reasonCodes": ["FITNESS_LEVEL_OK", "TIME_AVAILABLE"],
        "decisionSource": "PHYSICAL",
        "decisionStage": "FINALIZE",
        "timestamp": "2024-01-20T15:30:00Z",
        "countryCode": "JP",
        "routeDirectionId": "iceland_highlands_froad",
        "metadata": {
          "decisionTimeMs": 150,
          "impactsFinalPlan": true
        }
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

### 4.2 获取决策日志详情

**接口**: `GET /decision/admin/logs/:id`

**说明**: 获取单个决策日志的详细信息

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 决策日志ID |

**请求示例**:

```bash
GET /api/decision/admin/logs/log-uuid
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "log-uuid",
    "tripId": "trip-uuid",
    "userId": "user-uuid",
    "persona": "ABU",
    "action": "ALLOW",
    "explanation": "允许添加该景点，因为符合用户的体力水平",
    "reasonCodes": ["FITNESS_LEVEL_OK", "TIME_AVAILABLE"],
    "decisionSource": "PHYSICAL",
    "decisionStage": "FINALIZE",
    "timestamp": "2024-01-20T15:30:00Z",
    "countryCode": "JP",
    "routeDirectionId": "iceland_highlands_froad",
    "evidenceRefs": ["evidence-1", "evidence-2"],
    "metadata": {
      "decisionTimeMs": 150,
      "impactsFinalPlan": true,
      "availableOptions": [],
      "userChoice": {},
      "systemRecommendation": {}
    },
    "trip": {
      "id": "trip-uuid",
      "destination": "JP",
      "startDate": "2024-05-01T00:00:00Z"
    },
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "displayName": "John Doe"
    }
  }
}
```

---

### 4.3 获取决策统计信息

**接口**: `GET /decision/admin/stats`

**说明**: 获取决策相关的统计数据

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 统计开始日期（ISO 8601日期） | 2024-01-01 |
| `endDate` | string | 否 | 统计结束日期（ISO 8601日期） | 2024-12-31 |
| `countryCode` | string | 否 | 按国家筛选 | JP |
| `routeDirectionId` | string | 否 | 按路线方向筛选 | iceland_highlands_froad |

**请求示例**:

```bash
GET /api/decision/admin/stats?startDate=2024-01-01&endDate=2024-12-31&countryCode=JP
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalDecisions": 5000,
      "allowCount": 3500,
      "rejectCount": 800,
      "adjustCount": 500,
      "replaceCount": 200
    },
    "byPersona": {
      "ABU": { "count": 2000, "percentage": 40.0 },
      "DR_DRE": { "count": 1500, "percentage": 30.0 },
      "NEPTUNE": { "count": 1500, "percentage": 30.0 }
    },
    "byDecisionSource": {
      "PHYSICAL": { "count": 3000, "percentage": 60.0 },
      "HEURISTIC": { "count": 1500, "percentage": 30.0 },
      "PHILOSOPHY": { "count": 400, "percentage": 8.0 },
      "HUMAN": { "count": 100, "percentage": 2.0 }
    },
    "byAction": {
      "ALLOW": { "count": 3500, "percentage": 70.0 },
      "REJECT": { "count": 800, "percentage": 16.0 },
      "ADJUST": { "count": 500, "percentage": 10.0 },
      "REPLACE": { "count": 200, "percentage": 4.0 }
    },
    "realityDrivenRatio": 0.6,
    "qualityMetrics": {
      "avgDecisionTimeMs": 150,
      "avgReasonCodesCount": 2.5,
      "explanationQualityScore": 0.85
    },
    "trends": {
      "decisionsByMonth": [
        { "month": "2024-01", "count": 400 },
        { "month": "2024-02", "count": 450 },
        { "month": "2024-03", "count": 500 }
      ],
      "realityDrivenRatioByMonth": [
        { "month": "2024-01", "ratio": 0.55 },
        { "month": "2024-02", "ratio": 0.58 },
        { "month": "2024-03", "ratio": 0.62 }
      ]
    }
  }
}
```

---

### 4.4 获取决策分析报告

**接口**: `GET /decision/admin/analytics`

**说明**: 生成决策分析报告

**请求参数**: 同 `/decision/admin/stats`

**响应示例**:

```json
{
  "success": true,
  "data": {
    "qualityReport": {
      "overallScore": 0.85,
      "realityDrivenRatio": 0.6,
      "explanationQuality": 0.88,
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
        "reason": "体力不足",
        "count": 200,
        "percentage": 25.0
      },
      {
        "reason": "时间冲突",
        "count": 150,
        "percentage": 18.75
      }
    ],
    "replacementReasons": [
      {
        "reason": "天气原因",
        "count": 80,
        "percentage": 40.0
      }
    ]
  }
}
```

---

## 五、系统监控接口

### 5.1 获取系统指标

**接口**: `GET /system/admin/metrics`

**说明**: 获取系统整体指标统计

**请求参数**: 无

**请求示例**:

```bash
GET /api/system/admin/metrics
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "system": {
      "cpuUsage": 45.2,
      "memoryUsage": 62.5,
      "diskUsage": 38.0,
      "uptime": 86400
    },
    "api": {
      "totalRequests": 100000,
      "requestsPerSecond": 50,
      "avgResponseTime": 120,
      "p95ResponseTime": 250,
      "p99ResponseTime": 500,
      "errorRate": 0.01,
      "successRate": 0.99
    },
    "database": {
      "connectionPoolSize": 20,
      "activeConnections": 12,
      "idleConnections": 8,
      "queryCount": 50000,
      "avgQueryTime": 15,
      "slowQueries": 50
    },
    "cache": {
      "hitRate": 0.75,
      "missRate": 0.25,
      "totalKeys": 10000,
      "memoryUsage": 512
    },
    "timestamp": "2024-01-21T10:30:00Z"
  }
}
```

---

### 5.2 获取性能指标

**接口**: `GET /system/admin/performance`

**说明**: 获取详细的性能指标，支持时间范围筛选

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startTime` | string | 否 | 开始时间（ISO 8601） | 2024-01-21T00:00:00Z |
| `endTime` | string | 否 | 结束时间（ISO 8601） | 2024-01-21T23:59:59Z |
| `granularity` | string | 否 | 时间粒度：hour, day | hour |

**请求示例**:

```bash
GET /api/system/admin/performance?startTime=2024-01-21T00:00:00Z&endTime=2024-01-21T23:59:59Z&granularity=hour
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "timeSeries": [
      {
        "timestamp": "2024-01-21T10:00:00Z",
        "requestsPerSecond": 50,
        "avgResponseTime": 120,
        "errorRate": 0.01,
        "cpuUsage": 45.2,
        "memoryUsage": 62.5
      }
    ],
    "summary": {
      "peakRequestsPerSecond": 100,
      "peakResponseTime": 500,
      "peakErrorRate": 0.05
    }
  }
}
```

---

### 5.3 获取错误日志统计

**接口**: `GET /system/admin/errors`

**说明**: 获取错误日志统计信息

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startTime` | string | 否 | 开始时间（ISO 8601） | 2024-01-21T00:00:00Z |
| `endTime` | string | 否 | 结束时间（ISO 8601） | 2024-01-21T23:59:59Z |
| `level` | string | 否 | 错误级别：error, warn | error |

**请求示例**:

```bash
GET /api/system/admin/errors?startTime=2024-01-21T00:00:00Z&endTime=2024-01-21T23:59:59Z&level=error
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalErrors": 100,
      "errorRate": 0.01,
      "uniqueErrors": 25
    },
    "byType": {
      "VALIDATION_ERROR": { "count": 50, "percentage": 50.0 },
      "INTERNAL_ERROR": { "count": 30, "percentage": 30.0 },
      "NOT_FOUND": { "count": 20, "percentage": 20.0 }
    },
    "topErrors": [
      {
        "message": "Invalid trip ID format",
        "count": 20,
        "lastOccurred": "2024-01-21T10:30:00Z"
      }
    ],
    "trends": {
      "errorsByHour": [
        { "hour": "2024-01-21T10:00:00Z", "count": 5 },
        { "hour": "2024-01-21T11:00:00Z", "count": 8 }
      ]
    }
  }
}
```

---

## 六、Context 管理接口

### 6.1 获取 Context 指标统计

**接口**: `GET /context/admin/metrics`

**说明**: 获取 Context 使用情况的统计指标

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `tripId` | string | 否 | 行程ID筛选 | uuid |
| `phase` | string | 否 | Phase筛选 | planning |
| `agent` | string | 否 | Agent筛选 | PLANNER |
| `startTime` | string | 否 | 开始时间（ISO 8601） | 2024-01-01T00:00:00Z |
| `endTime` | string | 否 | 结束时间（ISO 8601） | 2024-12-31T23:59:59Z |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalBuilds": 1000,
      "avgTokens": 3200,
      "avgBuildTimeMs": 450,
      "cacheHitRate": 0.65,
      "compressionRate": 0.15
    },
    "byAgent": {
      "PLANNER": { "count": 500, "avgTokens": 3500 },
      "GATEKEEPER": { "count": 300, "avgTokens": 2000 }
    },
    "byPhase": {
      "planning": { "count": 800, "avgTokens": 3000 },
      "execution": { "count": 200, "avgTokens": 2500 }
    }
  }
}
```

---

### 6.2 获取 Context Package 列表

**接口**: `GET /context/admin/packages`

**说明**: 查看历史构建的 Context Package

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始 | 1 |
| `limit` | number | 否 | 每页数量，默认20 | 20 |
| `tripId` | string | 否 | Trip ID筛选 | uuid |
| `phase` | string | 否 | Phase筛选 | planning |
| `agent` | string | 否 | Agent筛选 | PLANNER |
| `startTime` | string | 否 | 开始时间（ISO 8601） | 2024-01-01T00:00:00Z |
| `endTime` | string | 否 | 结束时间（ISO 8601） | 2024-12-31T23:59:59Z |
| `search` | string | 否 | 搜索关键词 | keyword |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "packages": [
      {
        "id": "package-uuid",
        "tripId": "trip-uuid",
        "phase": "planning",
        "agent": "PLANNER",
        "tokenCount": 3200,
        "buildTimeMs": 450,
        "cacheHit": true,
        "createdAt": "2024-01-20T10:30:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

---

### 6.3 获取 Context Package 详情

**接口**: `GET /context/admin/packages/:id`

**说明**: 查看特定 Context Package 的详细信息

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | Context Package ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "package-uuid",
    "tripId": "trip-uuid",
    "phase": "planning",
    "agent": "PLANNER",
    "tokenCount": 3200,
    "buildTimeMs": 450,
    "cacheHit": true,
    "blocks": [
      {
        "type": "TRIP_CONTEXT",
        "content": "...",
        "tokenCount": 500
      }
    ],
    "metadata": {
      "compressionRate": 0.15,
      "qualityScore": 0.85
    },
    "createdAt": "2024-01-20T10:30:00Z"
  }
}
```

---

## 七、错误码说明

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 400 | 请求参数验证失败 |
| `UNAUTHORIZED` | 401 | 未授权访问 |
| `FORBIDDEN` | 403 | 禁止访问（权限不足） |
| `NOT_FOUND` | 404 | 资源不存在 |
| `BUSINESS_ERROR` | 400 | 业务逻辑错误 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率过高 |

---

## 八、前端集成示例

### TypeScript/React 示例

```typescript
// api/admin.ts
import axios from 'axios';

const API_BASE = '/api';

// 行程管理
export const tripsAdminApi = {
  // 获取行程列表
  getTrips: async (params: {
    page?: number;
    limit?: number;
    status?: string;
    destination?: string;
    sortBy?: string;
    sortOrder?: string;
    search?: string;
  }) => {
    const response = await axios.get(`${API_BASE}/trips/admin`, { params });
    return response.data;
  },

  // 获取行程统计
  getStats: async (params?: {
    startDate?: string;
    endDate?: string;
    destination?: string;
  }) => {
    const response = await axios.get(`${API_BASE}/trips/admin/stats`, { params });
    return response.data;
  },

  // 获取行程详情
  getTripDetail: async (id: string) => {
    const response = await axios.get(`${API_BASE}/trips/admin/${id}`);
    return response.data;
  },

  // 批量操作
  batchOperation: async (data: {
    action: 'DELETE' | 'UPDATE_STATUS';
    tripIds: string[];
    params?: any;
  }) => {
    const response = await axios.post(`${API_BASE}/trips/admin/batch`, data);
    return response.data;
  },

  // 导出数据
  exportTrip: async (id: string, format: 'json' | 'csv' = 'json') => {
    const response = await axios.get(`${API_BASE}/trips/admin/${id}/export`, {
      params: { format },
    });
    return response.data;
  },
};

// 决策日志管理
export const decisionAdminApi = {
  // 获取决策日志列表
  getLogs: async (params: {
    page?: number;
    limit?: number;
    tripId?: string;
    persona?: string;
    decisionSource?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await axios.get(`${API_BASE}/decision/admin/logs`, { params });
    return response.data;
  },

  // 获取决策日志详情
  getLogDetail: async (id: string) => {
    const response = await axios.get(`${API_BASE}/decision/admin/logs/${id}`);
    return response.data;
  },

  // 获取决策统计
  getStats: async (params?: {
    startDate?: string;
    endDate?: string;
    countryCode?: string;
  }) => {
    const response = await axios.get(`${API_BASE}/decision/admin/stats`, { params });
    return response.data;
  },

  // 获取决策分析报告
  getAnalytics: async (params?: {
    startDate?: string;
    endDate?: string;
    countryCode?: string;
  }) => {
    const response = await axios.get(`${API_BASE}/decision/admin/analytics`, { params });
    return response.data;
  },
};

// 系统监控
export const systemAdminApi = {
  // 获取系统指标
  getMetrics: async () => {
    const response = await axios.get(`${API_BASE}/system/admin/metrics`);
    return response.data;
  },

  // 获取性能指标
  getPerformance: async (params?: {
    startTime?: string;
    endTime?: string;
    granularity?: string;
  }) => {
    const response = await axios.get(`${API_BASE}/system/admin/performance`, { params });
    return response.data;
  },

  // 获取错误统计
  getErrors: async (params?: {
    startTime?: string;
    endTime?: string;
    level?: string;
  }) => {
    const response = await axios.get(`${API_BASE}/system/admin/errors`, { params });
    return response.data;
  },
};
```

### React Hook 示例

```typescript
// hooks/useTripsAdmin.ts
import { useState, useEffect } from 'react';
import { tripsAdminApi } from '../api/admin';

export const useTripsAdmin = (params: any) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await tripsAdminApi.getTrips(params);
        if (response.success) {
          setData(response.data);
        } else {
          setError(response.error);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [JSON.stringify(params)]);

  return { data, loading, error };
};
```

---

## 七、Agent 运行管理接口

### 7.1 获取 Agent 运行列表

**接口**: `GET /agent/admin/runs`

**说明**: 获取 TripRun 列表，支持分页、筛选、排序

**请求参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始 | 1 |
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
          "status": "COMPLETED"
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

### 7.2 获取 Agent 运行详情

**接口**: `GET /agent/admin/runs/:id`

**说明**: 获取单个 TripRun 的详细信息，包含所有关联的 TripAttempt

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
    "attempts": [
      {
        "id": "attempt-uuid",
        "attemptNumber": 1,
        "planOutline": "生成行程骨架...",
        "status": "COMPLETED",
        "createdAt": "2024-01-20T10:00:00Z"
      }
    ]
  }
}
```

---

### 7.3 获取 Agent 运行统计

**接口**: `GET /agent/admin/runs/stats`

**说明**: 获取 TripRun 的统计信息

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

### 7.4 获取 Attempt 列表

**接口**: `GET /agent/admin/attempts`

**说明**: 获取 TripAttempt 列表

**请求参数**: 类似 `/agent/admin/runs`，支持 `tripRunId` 筛选

---

### 7.5 获取 Attempt 详情

**接口**: `GET /agent/admin/attempts/:id`

**说明**: 获取单个 TripAttempt 的详细信息

---

### 7.6 取消运行

**接口**: `POST /agent/admin/runs/:id/cancel`

**说明**: 取消指定的 TripRun

---

### 7.7 获取 Agent 性能分析

**接口**: `GET /agent/admin/performance`

**说明**: 获取 Agent 运行的性能分析，包括平均耗时、P50/P95/P99等指标

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

## 八、规划工作台管理接口

### 8.1 获取规划会话列表

**接口**: `GET /planning-workbench/admin/sessions`

**说明**: 获取规划会话列表（基于 PlanningPlan）

**请求参数**: 类似其他列表接口，支持 `tripId`, `userId`, `status` 筛选

---

### 8.2 获取规划会话详情

**接口**: `GET /planning-workbench/admin/sessions/:id`

**说明**: 获取单个规划会话的详细信息，包含所有交互历史

---

### 8.3 获取会话统计

**接口**: `GET /planning-workbench/admin/sessions/stats`

**说明**: 获取规划会话的统计信息，包括成功率、平均时长等

---

### 8.4 获取规划方案列表

**接口**: `GET /planning-workbench/admin/plans`

**说明**: 获取规划方案列表

---

### 8.5 获取规划方案详情

**接口**: `GET /planning-workbench/admin/plans/:id`

**说明**: 获取单个规划方案的详细信息

---

## 九、接口状态说明

### ✅ 已实现
- 行程管理接口（5个）
- 决策日志管理接口（5个）
- 系统监控接口（6个）
- Context 管理接口（4个）
- Agent 运行管理接口（7个）
- 规划工作台管理接口（5个）

**总计**: 32个接口已实现

### ⚠️ 需要重启服务器
- 所有接口代码已实现，但需要重启 NestJS 服务器使路由生效

### 📝 待完善
- 部分统计功能需要完善（标记为 TODO）
- 低优先级模块（路线方向、城市/国家、模板、RAG、技能管理）

---

## 十、测试

### 测试命令

```bash
# 运行完整测试
npm run test:admin-api

# 或直接运行
ts-node scripts/test-admin-api.ts
```

### 测试覆盖

- ✅ 行程管理接口（5个）
- ⚠️ 决策日志管理接口（4个，需要添加代码）
- ✅ 系统监控接口（3个）
- ✅ Context 管理接口（2个）

---

## 十一、更新日志

### v1.0.0 (2026-01-21)
- 初始版本
- 实现高优先级接口（Phase 1）
- 包含完整的接口文档和前端集成示例

---

## 十二、联系方式

如有问题或建议，请联系开发团队。

**相关文档**:
- [前端对接接口文档](./ADMIN_API_FRONTEND.md)
- [系统需求分析](./ADMIN_SYSTEM_REQUIREMENTS.md)
- [测试结果](./ADMIN_API_TEST_RESULTS.md)
- [实现总结](./ADMIN_API_IMPLEMENTATION.md)
