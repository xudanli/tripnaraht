# 执行页面 - 后端接口文档

**文档版本**: v1.0  
**创建日期**: 2026-02-05  
**最后更新**: 2026-02-05  
**基础路径**: `/api/execution` 和 `/api/trips` 和 `/api/places`

---

## 📋 目录

1. [接口概览](#接口概览)
2. [P0 接口（已增强）](#p0-接口已增强)
3. [P1 接口（已新增）](#p1-接口已新增)
4. [P2 接口（已新增）](#p2-接口已新增)
5. [错误码说明](#错误码说明)
6. [测试示例](#测试示例)

---

## 接口概览

| 优先级 | 接口名称 | 方法 | 路径 | 状态 |
|--------|---------|------|------|------|
| **P0** | 获取行程状态 | GET | `/trips/:id/state` | ✅ 已增强 |
| **P0** | 执行操作 | POST | `/execution/execute` | ✅ 已增强 |
| **P1** | 重新排序行程 | POST | `/execution/reorder` | ✅ 已新增 |
| **P1** | 获取关键证据 | GET | `/places/:placeId/evidence` | ✅ 已新增 |
| **P2** | 应用修复方案 | POST | `/execution/apply-fallback` | ✅ 已新增 |
| **P2** | 预览修复方案 | GET | `/execution/fallback/:solutionId/preview` | ✅ 已新增 |

---

## P0 接口（已增强）

### 1. 获取行程状态（增强）

**接口**: `GET /api/trips/:id/state`

**功能说明**: 获取行程的当前状态，包括当前日期、当前行程项、下一站信息等。**已增强**：`nextStop` 现在包含完整的 `Place` 信息（坐标、营业时间等）。

**路径参数**:
- `id` (string, 必需): 行程ID（UUID）

**查询参数**:
- `now` (string, 可选): 指定当前时间（ISO格式），用于测试

**响应格式**:
```typescript
{
  success: true,
  data: {
    currentDayId: string | null;
    currentItemId: string | null;
    nextStop: {
      itemId: string;
      placeId: number;
      placeName: string;
      startTime: string;              // ISO格式
      estimatedArrivalTime: string;    // ISO格式
      Place: {                         // ⚠️ 新增：完整的地点信息
        id: number;
        nameEN?: string;
        nameCN?: string;
        latitude?: number;             // ⚠️ 新增：纬度
        longitude?: number;            // ⚠️ 新增：经度
        address?: string;
        businessHours?: {              // ⚠️ 新增：营业时间
          open?: string;               // "09:00"
          close?: string;              // "18:00"
          timezone?: string;           // "Asia/Tokyo"
          raw?: any;                   // 原始数据
        };
      };
    } | null;
    timezone: string;
    now: string;                       // ISO格式
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "currentDayId": "day-uuid-123",
    "currentItemId": null,
    "nextStop": {
      "itemId": "item-uuid-456",
      "placeId": 123,
      "placeName": "黄金瀑布",
      "startTime": "2026-02-05T10:00:00.000Z",
      "estimatedArrivalTime": "2026-02-05T10:00:00.000Z",
      "Place": {
        "id": 123,
        "nameEN": "Gullfoss",
        "nameCN": "黄金瀑布",
        "latitude": 64.3275,
        "longitude": -20.1214,
        "address": "Iceland",
        "businessHours": {
          "open": "09:00",
          "close": "18:00",
          "timezone": "Atlantic/Reykjavik",
          "raw": { "mon": "09:00-18:00", "tue": "09:00-18:00" }
        }
      }
    },
    "timezone": "Asia/Tokyo",
    "now": "2026-02-05T09:30:00.000Z"
  }
}
```

---

### 2. 执行操作（增强）

**接口**: `POST /api/execution/execute`

**功能说明**: 执行阶段的 Agent，负责处理行程执行中的各种事件和变更。**已增强**：
- `fallback` 操作现在返回多个修复方案（至少3个）
- `handle_change` 操作现在返回更新后的时间线

**请求格式**:
```typescript
{
  tripId: string;
  action: 'remind' | 'handle_change' | 'fallback' | 'get_status';
  
  // 提醒相关参数（action === 'remind' 时）
  remindParams?: {
    reminderTypes?: string[];
    advanceHours?: number;
  };
  
  // 变更相关参数（action === 'handle_change' 时）
  changeParams?: {
    changeType: string;
    changeDetails: {
      reason?: string;
      delayMinutes?: number;        // ⚠️ 新增：延迟分钟数
      itemId?: string;
    };
  };
  
  // 兜底相关参数（action === 'fallback' 时）
  fallbackParams?: {
    triggerReason: string;
    originalPlan?: any;
    itemId?: string;                 // ⚠️ 新增：指定要替换的行程项ID
  };
}
```

#### 2.1 获取提醒列表

**请求示例**:
```json
{
  "tripId": "trip-uuid-123",
  "action": "remind",
  "remindParams": {
    "reminderTypes": ["departure", "transport", "weather"],
    "advanceHours": 24
  }
}
```

**响应格式**:
```typescript
{
  success: true,
  data: {
    executionState: {
      tripId: string;
      phase: 'ON_TRIP' | 'CHANGE_HANDLING' | 'FALLBACK';
      currentDay: number;
      currentDate: string;
      reminders: Array<{
        id: string;
        type: string;
        title: string;
        message: string;
        triggerTime: string;
        priority: 'low' | 'medium' | 'high' | 'urgent';
      }>;
    };
    uiOutput: {
      reminders?: Array<Reminder>;
    };
  }
}
```

#### 2.2 处理变更（延迟/跳过）

**请求示例 - 延迟**:
```json
{
  "tripId": "trip-uuid-123",
  "action": "handle_change",
  "changeParams": {
    "changeType": "schedule_change",
    "changeDetails": {
      "reason": "用户请求延迟15分钟",
      "delayMinutes": 15,
      "itemId": "item-uuid-456"
    }
  }
}
```

**请求示例 - 跳过**:
```json
{
  "tripId": "trip-uuid-123",
  "action": "handle_change",
  "changeParams": {
    "changeType": "activity_cancelled",
    "changeDetails": {
      "reason": "用户请求跳过当前活动",
      "itemId": "item-uuid-456"
    }
  }
}
```

**响应格式**:
```typescript
{
  success: true,
  data: {
    executionState: {
      phase: 'CHANGE_HANDLING';
      pendingChanges: Array<{...}>;
    };
    uiOutput: {
      changeResult: {
        changeId: string;
        changeType: string;
        success: boolean;              // ⚠️ 新增
        message?: string;               // ⚠️ 新增
        updatedSchedule?: {             // ⚠️ 新增：更新后的时间线
          date: string;
          schedule: {
            items: Array<{
              placeId: number;
              placeName: string;
              startTime: string;
              endTime: string;
              status?: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
            }>;
          };
        };
      };
    };
  }
}
```

#### 2.3 触发修复（替换）

**请求示例**:
```json
{
  "tripId": "trip-uuid-123",
  "action": "fallback",
  "fallbackParams": {
    "triggerReason": "用户请求替换当前活动",
    "itemId": "item-uuid-456",
    "originalPlan": {}
  }
}
```

**响应格式**:
```typescript
{
  success: true,
  data: {
    executionState: {
      phase: 'FALLBACK';
      activeFallbacks: Array<{...}>;
    };
    uiOutput: {
      fallbackPlan: {
        id: string;
        triggerReason: string;
        solutions: Array<{              // ⚠️ 新增：多个修复方案
          id: string;
          type: 'minimal' | 'experience' | 'safety';
          title: string;
          description: string;
          changes: Array<{
            itemId: string;
            action: 'modify' | 'remove' | 'add';
            newTime?: string;
            newPlace?: any;
          }>;
          impact: {
            arrivalTime: string;        // "10:15 (+15分钟)"
            missingPlaces: number;
            riskChange: 'low' | 'medium' | 'high';
          };
          recommended?: boolean;
        }>;
      };
    };
  }
}
```

---

## P1 接口（已新增）

### 3. 重新排序行程

**接口**: `POST /api/execution/reorder`

**功能说明**: 重新排序指定日期的行程项顺序。

**请求格式**:
```typescript
{
  tripId: string;
  dayId: string;                    // 日期ID（通常是currentDayId）
  newOrder: string[];               // 重新排序后的行程项ID数组
  reason?: string;                  // 可选：重新排序原因
}
```

**请求示例**:
```json
{
  "tripId": "trip-uuid-123",
  "dayId": "day-uuid-456",
  "newOrder": ["item-uuid-3", "item-uuid-1", "item-uuid-2"],
  "reason": "用户请求调整顺序"
}
```

**响应格式**:
```typescript
{
  success: true,
  data: {
    success: boolean;
    message?: string;
    updatedSchedule: {
      date: string;
      schedule: {
        items: Array<{
          placeId: number;
          placeName: string;
          startTime: string;
          endTime: string;
        }>;
      };
    };
    impact?: {
      timeAdjustments: Array<{
        itemId: string;
        originalTime: string;
        newTime: string;
      }>;
      conflicts?: Array<{
        type: string;
        message: string;
      }>;
    };
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "行程已重新排序",
    "updatedSchedule": {
      "date": "2026-02-05",
      "schedule": {
        "items": [
          {
            "placeId": 123,
            "placeName": "地点C",
            "startTime": "09:00",
            "endTime": "11:00"
          },
          {
            "placeId": 456,
            "placeName": "地点A",
            "startTime": "11:30",
            "endTime": "13:30"
          },
          {
            "placeId": 789,
            "placeName": "地点B",
            "startTime": "14:00",
            "endTime": "16:00"
          }
        ]
      }
    },
    "impact": {
      "timeAdjustments": [
        {
          "itemId": "item-uuid-3",
          "originalTime": "14:00",
          "newTime": "09:00"
        },
        {
          "itemId": "item-uuid-1",
          "originalTime": "09:00",
          "newTime": "11:30"
        },
        {
          "itemId": "item-uuid-2",
          "originalTime": "11:30",
          "newTime": "14:00"
        }
      ]
    }
  }
}
```

---

### 4. 获取关键证据

**接口**: `GET /api/places/:placeId/evidence`

**功能说明**: 获取地点的关键证据信息（营业时间、封路信息、天气窗口等）。

**路径参数**:
- `placeId` (number, 必需): 地点ID

**查询参数**:
- `date` (string, 可选): 指定日期（YYYY-MM-DD），用于获取特定日期的信息
- `includeWeather` (boolean, 可选): 是否包含天气信息（默认true）
- `includeTraffic` (boolean, 可选): 是否包含交通信息（默认true）

**响应格式**:
```typescript
{
  success: true,
  data: {
    placeId: number;
    placeName: string;
    evidence: {
      businessHours?: {
        open: string;                // "09:00"
        close: string;               // "18:00"
        timezone: string;            // "Asia/Tokyo"
        exceptions?: Array<{
          date: string;
          open?: string;
          close?: string;
          closed?: boolean;
          note?: string;
        }>;
      };
      roadClosure?: {
        hasClosure: boolean;
        closures?: Array<{
          date: string;
          reason: string;
          affectedRoutes?: string[];
          alternativeRoutes?: string[];
        }>;
      };
      weatherWindow?: {
        date: string;
        condition: string;
        description: string;
        temperature: {
          min: number;
          max: number;
          unit: 'celsius' | 'fahrenheit';
        };
        precipitation?: {
          probability: number;
          amount?: number;
        };
        wind?: {
          speed: number;
          direction: string;
        };
        suitableForOutdoor?: boolean;
      };
      otherInfo?: {
        crowdLevel?: 'low' | 'medium' | 'high';
        specialEvents?: Array<{
          date: string;
          name: string;
          impact?: string;
        }>;
      };
    };
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "placeId": 123,
    "placeName": "黄金瀑布",
    "evidence": {
      "businessHours": {
        "open": "09:00",
        "close": "18:00",
        "timezone": "Atlantic/Reykjavik"
      },
      "roadClosure": {
        "hasClosure": false
      },
      "weatherWindow": {
        "date": "2026-02-05",
        "condition": "晴朗",
        "description": "晴朗，适合户外活动",
        "temperature": {
          "min": 5,
          "max": 10,
          "unit": "celsius"
        },
        "precipitation": {
          "probability": 10,
          "amount": 0
        },
        "wind": {
          "speed": 15,
          "direction": "N"
        },
        "suitableForOutdoor": true
      }
    }
  }
}
```

---

## P2 接口（已新增）

### 5. 应用修复方案

**接口**: `POST /api/execution/apply-fallback`

**功能说明**: 应用Neptune提供的修复方案。

**请求格式**:
```typescript
{
  tripId: string;
  solutionId: string;               // 修复方案ID（从fallback响应中获取）
  confirm?: boolean;                 // 是否确认应用（默认true）
}
```

**请求示例**:
```json
{
  "tripId": "trip-uuid-123",
  "solutionId": "solution-uuid-456",
  "confirm": true
}
```

**响应格式**:
```typescript
{
  success: true,
  data: {
    success: boolean;
    message?: string;
    appliedChanges: Array<{
      itemId: string;
      action: 'modified' | 'removed' | 'added';
      details: any;
    }>;
    updatedSchedule: {
      date: string;
      schedule: {
        items: Array<{
          placeId: number;
          placeName: string;
          startTime: string;
          endTime: string;
        }>;
      };
    };
    impact: {
      arrivalTime: string;
      missingPlaces: number;
      riskChange: 'low' | 'medium' | 'high';
    };
  }
}
```

---

### 6. 预览修复方案

**接口**: `GET /api/execution/fallback/:solutionId/preview`

**功能说明**: 预览修复方案的详细变更内容。

**路径参数**:
- `solutionId` (string, 必需): 修复方案ID

**响应格式**:
```typescript
{
  success: true,
  data: {
    solutionId: string;
    type: 'minimal' | 'experience' | 'safety';
    title: string;
    description: string;
    changes: Array<{
      itemId: string;
      action: 'modify' | 'remove' | 'add';
      original?: {
        placeName: string;
        startTime: string;
        endTime: string;
      };
      modified?: {
        placeName: string;
        startTime: string;
        endTime: string;
      };
      reason?: string;
    }>;
    impact: {
      arrivalTime: string;
      missingPlaces: number;
      riskChange: 'low' | 'medium' | 'high';
    };
    timeline: {
      date: string;
      schedule: {
        items: Array<{
          placeId: number;
          placeName: string;
          startTime: string;
          endTime: string;
          status: 'unchanged' | 'modified' | 'new' | 'removed';
        }>;
      };
    };
  }
}
```

---

## 错误码说明

所有接口遵循统一的错误响应格式：

```typescript
{
  success: false,
  error: {
    code: string;                   // 错误代码
    message: string;                // 错误消息（用户友好）
    details?: any;                  // 可选：错误详情（用于调试）
  }
}
```

**常见错误码**:
- `NOT_FOUND`: 资源不存在（404）
- `VALIDATION_ERROR`: 请求参数错误（400）
- `INTERNAL_ERROR`: 服务器内部错误（500）
- `BAD_REQUEST`: 请求格式错误（400）

---

## 测试示例

### 使用 curl 测试

#### 1. 获取行程状态
```bash
curl -X GET "http://localhost:3000/api/trips/trip-uuid-123/state?now=2026-02-05T09:30:00Z" \
  -H "Content-Type: application/json"
```

#### 2. 获取提醒列表
```bash
curl -X POST "http://localhost:3000/api/execution/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "trip-uuid-123",
    "action": "remind",
    "remindParams": {
      "reminderTypes": ["departure", "transport"],
      "advanceHours": 24
    }
  }'
```

#### 3. 处理变更（延迟）
```bash
curl -X POST "http://localhost:3000/api/execution/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "trip-uuid-123",
    "action": "handle_change",
    "changeParams": {
      "changeType": "schedule_change",
      "changeDetails": {
        "reason": "用户请求延迟15分钟",
        "delayMinutes": 15,
        "itemId": "item-uuid-456"
      }
    }
  }'
```

#### 4. 触发修复
```bash
curl -X POST "http://localhost:3000/api/execution/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "trip-uuid-123",
    "action": "fallback",
    "fallbackParams": {
      "triggerReason": "用户请求替换当前活动",
      "itemId": "item-uuid-456"
    }
  }'
```

#### 5. 重新排序行程
```bash
curl -X POST "http://localhost:3000/api/execution/reorder" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "trip-uuid-123",
    "dayId": "day-uuid-456",
    "newOrder": ["item-uuid-3", "item-uuid-1", "item-uuid-2"],
    "reason": "用户请求调整顺序"
  }'
```

#### 6. 获取关键证据
```bash
curl -X GET "http://localhost:3000/api/places/123/evidence?date=2026-02-05&includeWeather=true&includeTraffic=true" \
  -H "Content-Type: application/json"
```

#### 7. 应用修复方案
```bash
curl -X POST "http://localhost:3000/api/execution/apply-fallback" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "trip-uuid-123",
    "solutionId": "solution-uuid-456",
    "confirm": true
  }'
```

#### 8. 预览修复方案
```bash
curl -X GET "http://localhost:3000/api/execution/fallback/solution-uuid-456/preview" \
  -H "Content-Type: application/json"
```

---

## 注意事项

1. **时间格式**: 所有时间字段使用 ISO 8601 格式（如 `2026-02-05T09:30:00.000Z`），时间显示使用 `HH:mm` 格式（如 `09:30`）

2. **时区处理**: 所有时间字段应包含时区信息，建议使用 ISO 8601 格式自动包含时区

3. **fallback方案缓存**: fallback方案使用内存缓存，重启服务后会丢失。生产环境建议使用 Redis 或数据库存储

4. **错误处理**: 所有接口都应返回明确的错误代码和消息，使用统一的错误响应格式

5. **认证**: 当前所有接口使用 `@Public()` 装饰器，生产环境应添加认证中间件

6. **超时配置**: 建议根据 action 类型设置不同的超时时间：
   - `get_status`: 60秒（快速响应）
   - `remind`: 60秒（通常不需要 LLM）
   - `handle_change`: 120秒（需要 LLM，可能较慢）
   - `fallback`: 120秒（需要 LLM，可能较慢）
   
   详细实现指南请参考：`EXECUTION_API_TIMEOUT_CONFIG.md`

---

**文档状态**: ✅ 已完成  
**最后更新**: 2026-02-05
