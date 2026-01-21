# 行程列表后台管理接口文档

**基础路径**: `/api/trips/admin`  
**使用方**: 后台管理系统、运维人员  
**创建日期**: 2026-01-21

---

## 接口总览

| 接口 | 方法 | 说明 | 状态 |
|------|------|------|------|
| `/trips/admin` | GET | 行程列表（分页、筛选、排序） | ⚠️ 需要创建 |
| `/trips/admin/stats` | GET | 行程统计信息 | ⚠️ 需要创建 |
| `/trips/admin/:id` | GET | 行程详情（管理视图） | ⚠️ 需要创建 |
| `/trips/admin/:id/export` | GET | 导出行程数据 | ⚠️ 需要创建 |
| `/trips/admin/batch` | POST | 批量操作（删除、状态更新等） | ⚠️ 需要创建 |

---

## 一、行程列表接口

### GET `/trips/admin` - 获取行程列表

**用途**: 后台管理系统展示所有行程，支持分页、筛选、排序、搜索

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `page` | number | 否 | 页码，从1开始 | 1 |
| `limit` | number | 否 | 每页数量，默认20，最大100 | 20 |
| `status` | string | 否 | 状态筛选：PLANNING, IN_PROGRESS, COMPLETED, CANCELLED | PLANNING |
| `destination` | string | 否 | 目的地国家代码筛选（ISO 3166-1 alpha-2） | JP |
| `startDateFrom` | string | 否 | 开始日期范围（ISO 8601） | 2024-01-01 |
| `startDateTo` | string | 否 | 结束日期范围（ISO 8601） | 2024-12-31 |
| `createdAtFrom` | string | 否 | 创建时间范围（ISO 8601） | 2024-01-01T00:00:00Z |
| `createdAtTo` | string | 否 | 创建时间范围（ISO 8601） | 2024-12-31T23:59:59Z |
| `userId` | string | 否 | 用户ID筛选 | uuid |
| `sortBy` | string | 否 | 排序字段：createdAt, updatedAt, startDate, endDate | createdAt |
| `sortOrder` | string | 否 | 排序方向：asc, desc | desc |
| `search` | string | 否 | 搜索关键词（搜索目的地、用户邮箱等） | Tokyo |

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
          "currency": "CNY"
        },
        "pacingConfig": {
          "level": "STANDARD",
          "maxDailyActivities": 5
        },
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-20T15:45:00Z",
        "owner": {
          "userId": "user-uuid",
          "email": "user@example.com",
          "displayName": "John Doe"
        },
        "stats": {
          "daysCount": 5,
          "itemsCount": 25,
          "collaboratorsCount": 2,
          "likesCount": 5,
          "collectionsCount": 3
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

**功能要求**:
- ✅ 分页支持
- ✅ 多条件筛选（状态、目的地、日期范围、用户）
- ✅ 排序支持（创建时间、更新时间、开始日期、结束日期）
- ✅ 搜索功能（目的地、用户邮箱、用户名称）
- ✅ 关联数据统计（天数、行程项数、协作者数、点赞数、收藏数）
- ✅ 用户信息关联（创建者信息）

---

## 二、统计信息接口

### GET `/trips/admin/stats` - 获取行程统计信息

**用途**: 后台管理系统展示行程相关的统计数据

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `startDate` | string | 否 | 统计开始日期（ISO 8601） | 2024-01-01 |
| `endDate` | string | 否 | 统计结束日期（ISO 8601） | 2024-12-31 |
| `destination` | string | 否 | 按目的地筛选 | JP |

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

**功能要求**:
- ✅ 总体统计（总数、各状态数量）
- ✅ 按状态分类统计
- ✅ 按目的地分类统计
- ✅ 按时间范围统计（最近7天、30天、90天、1年）
- ✅ 用户参与度统计（平均天数、平均行程项数、协作者数、点赞数、收藏数、分享数）
- ✅ 预算统计（平均预算、中位数、总预算、预算分布）
- ✅ 趋势分析（新增行程趋势、完成率趋势）

---

## 三、行程详情接口

### GET `/trips/admin/:id` - 获取行程详情（管理视图）

**用途**: 后台管理系统查看单个行程的完整信息

**路径参数**:
- `id`: 行程ID (UUID)

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
      "displayName": "John Doe",
      "avatarUrl": "https://..."
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

**功能要求**:
- ✅ 完整的行程基本信息
- ✅ 创建者和协作者信息
- ✅ 所有行程日期和行程项详情
- ✅ 社交数据（点赞、收藏、分享）
- ✅ 统计信息
- ✅ 决策日志摘要
- ✅ 元数据信息（生成进度等）

---

## 四、批量操作接口

### POST `/trips/admin/batch` - 批量操作

**用途**: 批量执行操作（删除、状态更新等）

**请求体**:

```json
{
  "action": "DELETE", // DELETE, UPDATE_STATUS
  "tripIds": [
    "trip-id-1",
    "trip-id-2",
    "trip-id-3"
  ],
  "params": {
    // 当 action 为 UPDATE_STATUS 时
    "status": "CANCELLED"
  }
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "action": "DELETE",
    "total": 3,
    "success": 2,
    "failed": 1,
    "errors": [
      {
        "tripId": "trip-id-3",
        "error": "行程不存在或无权删除"
      }
    ]
  }
}
```

**功能要求**:
- ✅ 批量删除行程
- ✅ 批量更新状态
- ✅ 操作结果反馈（成功数、失败数、错误详情）

---

## 五、导出接口

### GET `/trips/admin/:id/export` - 导出行程数据

**用途**: 导出单个行程的完整数据（用于备份、分析等）

**路径参数**:
- `id`: 行程ID (UUID)

**查询参数**:
- `format`: 导出格式（json, csv），默认 json

**响应**:
- JSON格式：直接返回JSON数据
- CSV格式：返回CSV文件下载

**功能要求**:
- ✅ JSON格式导出（完整数据）
- ✅ CSV格式导出（表格数据）
- ✅ 包含所有关联数据（日期、行程项、用户信息等）

---

## 六、数据模型参考

### Trip 核心字段

```typescript
{
  id: string;                    // UUID
  destination: string;           // 国家代码（ISO 3166-1 alpha-2）
  startDate: DateTime;           // 开始日期
  endDate: DateTime;             // 结束日期
  status: string;                // PLANNING, IN_PROGRESS, COMPLETED, CANCELLED
  budgetConfig: Json;            // 预算配置
  pacingConfig: Json;            // 节奏配置
  metadata: Json;                 // 元数据
  createdAt: DateTime;           // 创建时间
  updatedAt: DateTime;           // 更新时间
}
```

### 关联数据

- `TripDay[]`: 行程日期列表
- `ItineraryItem[]`: 行程项列表（通过 TripDay 关联）
- `TripCollaborator[]`: 协作者列表
- `TripLike[]`: 点赞记录
- `TripCollection[]`: 收藏记录
- `TripShare[]`: 分享记录
- `User`: 创建者（通过 TripCollaborator 关联，role='OWNER'）

---

## 七、实现建议

### 1. 服务层方法

在 `TripsService` 中添加以下方法：

```typescript
// 列表查询
async findAllAdmin(query: AdminTripListQueryDto): Promise<PaginatedTripListDto>

// 统计信息
async getAdminStats(query: AdminTripStatsQueryDto): Promise<AdminTripStatsDto>

// 详情查询
async findOneAdmin(id: string): Promise<AdminTripDetailDto>

// 批量操作
async batchOperation(action: string, tripIds: string[], params?: any): Promise<BatchOperationResultDto>

// 导出
async exportTrip(id: string, format: 'json' | 'csv'): Promise<any>
```

### 2. DTO 定义

创建以下 DTO：

- `AdminTripListQueryDto`: 列表查询参数
- `PaginatedTripListDto`: 分页列表响应
- `AdminTripStatsQueryDto`: 统计查询参数
- `AdminTripStatsDto`: 统计响应
- `AdminTripDetailDto`: 详情响应
- `BatchOperationRequestDto`: 批量操作请求
- `BatchOperationResultDto`: 批量操作响应

### 3. 控制器路由

在 `TripsController` 中添加：

```typescript
@Get('admin')
@Get('admin/stats')
@Get('admin/:id')
@Get('admin/:id/export')
@Post('admin/batch')
```

### 4. 权限控制

- 所有 admin 接口需要管理员权限
- 建议使用 `@Roles('admin')` 装饰器
- 或使用 `@Public()` 临时开放测试（生产环境需移除）

---

## 八、参考实现

参考以下现有实现：

1. **用户管理接口**: `src/users/users.controller.ts`
   - `GET /users/admin/stats`
   - `GET /users/admin/:id`

2. **Context 管理接口**: `src/agent/context-engine/context.controller.ts`
   - `GET /context/admin/metrics`
   - `GET /context/admin/packages`

3. **训练管理接口**: `src/agent/training/training.controller.ts`
   - `GET /training/admin/trajectories`
   - `GET /training/admin/stats`

---

## 九、优先级建议

### 高优先级（MVP）
1. ✅ `GET /trips/admin` - 行程列表（基础分页和筛选）
2. ✅ `GET /trips/admin/stats` - 统计信息（基础统计）
3. ✅ `GET /trips/admin/:id` - 行程详情

### 中优先级
4. ⚠️ `POST /trips/admin/batch` - 批量操作
5. ⚠️ `GET /trips/admin/:id/export` - 导出功能

### 低优先级（增强功能）
6. 📝 高级筛选（多条件组合）
7. 📝 高级排序（多字段排序）
8. 📝 数据可视化接口（图表数据）
9. 📝 操作日志记录

---

## 十、注意事项

1. **性能优化**:
   - 列表查询需要添加数据库索引（status, destination, createdAt, userId）
   - 统计查询考虑使用缓存（Redis）
   - 关联查询使用 `include` 时注意 N+1 问题

2. **数据安全**:
   - 敏感信息（如用户邮箱）需要权限控制
   - 批量删除需要二次确认机制
   - 操作日志记录所有管理操作

3. **兼容性**:
   - 保持与现有用户接口的响应格式一致
   - 使用统一的响应格式（successResponse/errorResponse）

4. **测试**:
   - 单元测试覆盖所有查询条件
   - 集成测试验证权限控制
   - 性能测试验证大数据量场景
