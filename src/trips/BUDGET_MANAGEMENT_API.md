# 预算管理 API 文档

本文档介绍用户端和规划工作台的预算管理相关接口。

## 目录

- [用户端预算管理接口](#用户端预算管理接口)
- [规划工作台预算接口](#规划工作台预算接口)
- [行程项费用管理接口](#行程项费用管理接口)

---

## 用户端预算管理接口

### 基础路径
`/api/trips`

### 1. 设置预算约束

**接口**: `POST /api/trips/:id/budget/constraint`

**描述**: 为行程设置或更新预算约束（总预算、货币单位、日均预算、分类预算限制等）

**路径参数**:
- `id` (string, UUID): 行程 ID

**请求体**:
```json
{
  "total": 20000,                    // 总预算（必填，单位：CNY，范围：100-1000000）
  "currency": "CNY",                 // 货币单位（可选，默认 "CNY"，支持：CNY/USD/EUR/JPY）
  "dailyBudget": 4000,               // 日均预算（可选，自动计算或手动设置）
  "categoryLimits": {                // 分类预算限制（可选）
    "accommodation": 8000,           // 住宿预算
    "transportation": 5000,           // 交通预算
    "food": 4000,                    // 餐饮预算
    "activities": 2000,              // 活动预算
    "other": 1000                    // 其他预算
  },
  "alertThreshold": 0.8              // 预警阈值（可选，默认 0.8，即 80%）
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "budgetConstraint": {
      "total": 20000,
      "currency": "CNY",
      "dailyBudget": 4000,
      "categoryLimits": {
        "accommodation": 8000,
        "transportation": 5000,
        "food": 4000,
        "activities": 2000,
        "other": 1000
      },
      "alertThreshold": 0.8
    },
    "updatedAt": "2026-02-04T10:30:00.000Z"
  }
}
```

---

### 2. 获取预算约束

**接口**: `GET /api/trips/:id/budget/constraint`

**描述**: 获取行程的预算约束配置。如果未设置预算约束，会从准备度接口获取 `budgetLevel`（'low' | 'medium' | 'high'）并提供默认预算建议。

**路径参数**:
- `id` (string, UUID): 行程 ID

**查询参数**:
- `userId` (string, 可选): 用户 ID，用于从准备度接口获取用户的 `budgetLevel` 偏好

**响应示例（已设置预算约束）**:
```json
{
  "success": true,
  "data": {
    "budgetConstraint": {
      "total": 20000,
      "currency": "CNY",
      "dailyBudget": 4000,
      "categoryLimits": {
        "accommodation": 8000,
        "transportation": 5000,
        "food": 4000,
        "activities": 2000,
        "other": 1000
      },
      "alertThreshold": 0.8
    },
    "createdAt": "2026-02-04T09:00:00.000Z",
    "updatedAt": "2026-02-04T10:30:00.000Z"
  }
}
```

**响应示例（未设置预算约束，返回推荐预算）**:
```json
{
  "success": true,
  "data": {
    "budgetConstraint": {
      "total": 15000,
      "currency": "CNY",
      "dailyBudget": 3000,
      "categoryLimits": {
        "accommodation": 5250,
        "transportation": 3750,
        "food": 3000,
        "activities": 2250,
        "other": 750
      },
      "alertThreshold": 0.8,
      "_isRecommended": true
    },
    "createdAt": null,
    "updatedAt": null
  }
}
```

**注意**: 
- 如果行程没有设置预算约束，系统会从准备度接口获取 `budgetLevel`（从用户偏好或行程 metadata 中提取），并根据预算水平和行程天数计算推荐预算。
- `_isRecommended: true` 表示这是系统推荐的预算，而非用户手动设置的。
- 如果无法获取 `budgetLevel` 或计算推荐预算失败，`budgetConstraint` 为 `null`。
- 推荐预算的计算规则：
  - **low**: 基准预算的 60%（每人每天约 300 CNY）
  - **medium**: 基准预算的 100%（每人每天约 500 CNY）
  - **high**: 基准预算的 180%（每人每天约 900 CNY）
- 分类预算分配比例：住宿 35%、交通 25%、餐饮 20%、活动 15%、其他 5%。

---

### 3. 删除预算约束

**接口**: `DELETE /api/trips/:id/budget/constraint`

**描述**: 删除行程的预算约束（恢复为无预算限制）

**路径参数**:
- `id` (string, UUID): 行程 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "deletedAt": "2026-02-04T11:00:00.000Z"
  }
}
```

---

### 4. 获取预算摘要

**接口**: `GET /api/trips/:id/budget/summary`

**描述**: 实时查看行程消费和预算情况，包含各类消费明细分类。支持时间范围和分类筛选。

**路径参数**:
- `id` (string, UUID): 行程 ID

**查询参数**:
- `startDate` (string, ISO 8601, 可选): 开始日期
- `endDate` (string, ISO 8601, 可选): 结束日期
- `category` (string, 可选): 分类筛选（accommodation/transportation/food/activities/other）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "budgetConstraint": {
      "total": 20000,
      "currency": "CNY"
    },
    "totalSpent": 15000,
    "remainingBudget": 5000,
    "budgetUsage": 0.75,
    "categoryBreakdown": {
      "accommodation": { "budget": 8000, "spent": 6000, "remaining": 2000 },
      "transportation": { "budget": 5000, "spent": 4000, "remaining": 1000 },
      "food": { "budget": 4000, "spent": 3000, "remaining": 1000 },
      "activities": { "budget": 2000, "spent": 1500, "remaining": 500 },
      "other": { "budget": 1000, "spent": 500, "remaining": 500 }
    },
    "dailyBreakdown": [
      {
        "date": "2026-02-11",
        "spent": 3000,
        "items": 5
      },
      {
        "date": "2026-02-12",
        "spent": 4000,
        "items": 7
      }
    ],
    "alerts": [
      {
        "type": "BUDGET_WARNING",
        "message": "住宿预算使用率已达 75%",
        "category": "accommodation",
        "severity": "WARNING"
      }
    ]
  }
}
```

---

### 5. 检查预算预警

**接口**: `GET /api/trips/:id/budget/alert`

**描述**: 添加新活动前检查是否会触发预算预警

**路径参数**:
- `id` (string, UUID): 行程 ID

**查询参数**:
- `cost` (number, 必填): 新增项的成本

**响应示例**:
```json
{
  "success": true,
  "data": {
    "hasAlert": true,
    "alert": {
      "type": "BUDGET_WARNING",
      "message": "添加此项后，总预算使用率将达到 85%，超过预警阈值 80%",
      "severity": "WARNING",
      "currentUsage": 0.75,
      "projectedUsage": 0.85,
      "threshold": 0.8
    },
    "suggestions": [
      "考虑调整其他活动的预算",
      "增加总预算",
      "选择更经济的替代方案"
    ]
  }
}
```

---

### 6. 获取预算优化建议

**接口**: `GET /api/trips/:id/budget/optimization`

**描述**: 提供合理的预算优化建议，包括替换、移除、调整等方案

**路径参数**:
- `id` (string, UUID): 行程 ID

**查询参数**:
- `category` (string, 可选): 消费类别（accommodation/transportation/food/activities/other）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "optimizations": [
      {
        "type": "REPLACE",
        "category": "accommodation",
        "description": "建议将酒店 A 替换为酒店 B，可节省 500 元",
        "savings": 500,
        "impact": "LOW",
        "itemId": "item-123"
      },
      {
        "type": "ADJUST",
        "category": "food",
        "description": "建议减少高档餐厅用餐次数，可节省 300 元",
        "savings": 300,
        "impact": "MEDIUM",
        "itemIds": ["item-456", "item-789"]
      },
      {
        "type": "REMOVE",
        "category": "activities",
        "description": "建议移除可选活动 C，可节省 200 元",
        "savings": 200,
        "impact": "LOW",
        "itemId": "item-abc"
      }
    ],
    "totalPotentialSavings": 1000
  }
}
```

---

## 规划工作台预算接口

### 基础路径
`/api/planning-workbench`

### 1. 预算合理性评估

**接口**: `POST /api/planning-workbench/budget/evaluate`

**描述**: 评估规划方案的预算合理性（Should-Exist Gate 的一部分）

**请求体**:
```json
{
  "planId": "plan-123",
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
  "estimatedCost": 18000,
  "categoryBreakdown": {
    "accommodation": 7000,
    "transportation": 5000,
    "food": 3500,
    "activities": 2000,
    "other": 500
  },
  "budgetConstraint": {
    "total": 20000,
    "currency": "CNY",
    "dailyBudget": 4000,
    "categoryLimits": {
      "accommodation": 8000,
      "transportation": 5000,
      "food": 4000,
      "activities": 2000,
      "other": 1000
    },
    "alertThreshold": 0.8
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "planId": "plan-123",
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "isValid": true,
    "budgetUsage": 0.9,
    "categoryUsage": {
      "accommodation": 0.875,
      "transportation": 1.0,
      "food": 0.875,
      "activities": 1.0,
      "other": 0.5
    },
    "warnings": [
      {
        "category": "transportation",
        "message": "交通预算已用尽",
        "severity": "WARNING"
      },
      {
        "category": "activities",
        "message": "活动预算已用尽",
        "severity": "WARNING"
      }
    ],
    "suggestions": [
      "考虑增加交通预算",
      "选择更经济的活动方案"
    ],
    "decisionLog": {
      "timestamp": "2026-02-04T10:30:00.000Z",
      "evaluator": "BudgetEvaluationService",
      "result": "PASS_WITH_WARNINGS"
    }
  }
}
```

---

### 2. 获取预算决策日志

**接口**: `GET /api/planning-workbench/budget/decision-log`

**描述**: 获取预算评估的决策日志（用于可解释性）

**查询参数**:
- `planId` (string, 必填): 方案 ID
- `tripId` (string, 必填): 行程 ID
- `limit` (number, 可选): 分页限制（默认 50）
- `offset` (number, 可选): 分页偏移（默认 0）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "planId": "plan-123",
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "logs": [
      {
        "timestamp": "2026-02-04T10:30:00.000Z",
        "evaluator": "BudgetEvaluationService",
        "action": "EVALUATE",
        "result": "PASS_WITH_WARNINGS",
        "details": {
          "estimatedCost": 18000,
          "budgetLimit": 20000,
          "usage": 0.9,
          "warnings": ["交通预算已用尽", "活动预算已用尽"]
        }
      },
      {
        "timestamp": "2026-02-04T10:25:00.000Z",
        "evaluator": "BudgetEvaluationService",
        "action": "EVALUATE",
        "result": "FAIL",
        "details": {
          "estimatedCost": 22000,
          "budgetLimit": 20000,
          "usage": 1.1,
          "reason": "总预算超支"
        }
      }
    ],
    "total": 2,
    "limit": 50,
    "offset": 0
  }
}
```

---

## 行程项费用管理接口

### 基础路径
`/api/itinerary-items`

### 1. 获取行程项费用

**接口**: `GET /api/itinerary-items/:id/cost`

**描述**: 获取单个行程项的费用详情

**路径参数**:
- `id` (string, UUID): 行程项 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "itemId": "item-123",
    "estimatedCost": 500,
    "actualCost": 480,
    "currency": "CNY",
    "costCategory": "ACCOMMODATION",
    "costNote": "酒店住宿费用",
    "isPaid": true,
    "paidBy": "user-456",
    "paidAt": "2026-02-04T10:00:00.000Z",
    "place": {
      "id": 1,
      "nameCN": "雷克雅未克中心酒店",
      "nameEN": "Reykjavik Center Hotel",
      "category": "HOTEL"
    }
  }
}
```

---

### 2. 更新行程项费用

**接口**: `PATCH /api/itinerary-items/:id/cost`

**描述**: 更新单个行程项的预估费用、实际费用、支付状态等

**路径参数**:
- `id` (string, UUID): 行程项 ID

**请求体**:
```json
{
  "estimatedCost": 500,              // 预估费用（可选）
  "actualCost": 480,                 // 实际费用（可选）
  "currency": "CNY",                 // 货币单位（可选）
  "costCategory": "ACCOMMODATION",   // 费用分类（可选）：ACCOMMODATION/TRANSPORTATION/FOOD/ACTIVITIES/OTHER
  "costNote": "酒店住宿费用",         // 费用备注（可选）
  "isPaid": true,                    // 是否已支付（可选）
  "paidBy": "user-456"               // 支付人（可选）
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "item": {
      "id": "item-123",
      "estimatedCost": 500,
      "actualCost": 480,
      "currency": "CNY",
      "costCategory": "ACCOMMODATION",
      "costNote": "酒店住宿费用",
      "isPaid": true,
      "paidBy": "user-456"
    },
    "message": "费用更新成功"
  }
}
```

---

### 3. 批量更新费用

**接口**: `PATCH /api/itinerary-items/batch-cost`

**描述**: 批量更新多个行程项的实际费用和支付状态，适用于旅行后记账场景

**请求体**:
```json
{
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
  "updates": [
    {
      "itemId": "item-123",
      "actualCost": 480,
      "isPaid": true,
      "paidBy": "user-456"
    },
    {
      "itemId": "item-456",
      "actualCost": 200,
      "isPaid": false
    }
  ]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "updated": 2,
    "failed": 0,
    "failedIds": [],
    "message": "成功更新 2 条记录"
  }
}
```

---

### 4. 获取行程费用汇总

**接口**: `GET /api/itinerary-items/trip/:tripId/cost-summary`

**描述**: 获取行程的费用汇总，包括按分类、按日期的统计，以及预算使用情况

**路径参数**:
- `tripId` (string, UUID): 行程 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "totalEstimatedCost": 18000,
    "totalActualCost": 17500,
    "currency": "CNY",
    "categorySummary": {
      "ACCOMMODATION": {
        "estimated": 7000,
        "actual": 6800,
        "itemCount": 5
      },
      "TRANSPORTATION": {
        "estimated": 5000,
        "actual": 5000,
        "itemCount": 8
      },
      "FOOD": {
        "estimated": 3500,
        "actual": 3400,
        "itemCount": 12
      },
      "ACTIVITIES": {
        "estimated": 2000,
        "actual": 2000,
        "itemCount": 6
      },
      "OTHER": {
        "estimated": 500,
        "actual": 300,
        "itemCount": 2
      }
    },
    "dailySummary": [
      {
        "date": "2026-02-11",
        "estimated": 3000,
        "actual": 2900,
        "itemCount": 5
      },
      {
        "date": "2026-02-12",
        "estimated": 4000,
        "actual": 4000,
        "itemCount": 7
      }
    ],
    "paymentStatus": {
      "paid": 12000,
      "unpaid": 5500,
      "paidItemCount": 25,
      "unpaidItemCount": 8
    }
  }
}
```

---

### 5. 获取未支付行程项

**接口**: `GET /api/itinerary-items/trip/:tripId/unpaid`

**描述**: 获取行程中所有未支付的行程项列表，便于用户追踪待付款项目

**路径参数**:
- `tripId` (string, UUID): 行程 ID

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "item-123",
      "place": {
        "nameCN": "雷克雅未克中心酒店",
        "nameEN": "Reykjavik Center Hotel"
      },
      "estimatedCost": 500,
      "actualCost": 480,
      "currency": "CNY",
      "costCategory": "ACCOMMODATION",
      "isPaid": false,
      "date": "2026-02-11"
    },
    {
      "id": "item-456",
      "place": {
        "nameCN": "蓝湖温泉",
        "nameEN": "Blue Lagoon"
      },
      "estimatedCost": 200,
      "actualCost": null,
      "currency": "CNY",
      "costCategory": "ACTIVITIES",
      "isPaid": false,
      "date": "2026-02-12"
    }
  ]
}
```

---

## 费用分类说明

### CostCategory 枚举值

- `ACCOMMODATION`: 住宿
- `TRANSPORTATION`: 交通
- `FOOD`: 餐饮
- `ACTIVITIES`: 活动
- `OTHER`: 其他

### 费用分类自动映射规则

系统会根据行程项类型（ItemType）自动分配默认费用分类：

- `ACTIVITY` → `ACTIVITIES`
- `REST` → `OTHER`
- `MEAL_ANCHOR` → `FOOD`
- `MEAL_FLOATING` → `FOOD`
- `TRANSIT` → `TRANSPORTATION`

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `NOT_FOUND` | 404 | 资源不存在（行程、行程项等） |
| `VALIDATION_ERROR` | 400 | 请求参数验证失败 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 使用示例

### 示例 1: 设置预算约束并查看摘要

```javascript
// 1. 设置预算约束
const setBudget = async (tripId) => {
  const response = await fetch(`/api/trips/${tripId}/budget/constraint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      total: 20000,
      currency: 'CNY',
      dailyBudget: 4000,
      categoryLimits: {
        accommodation: 8000,
        transportation: 5000,
        food: 4000,
        activities: 2000,
        other: 1000
      },
      alertThreshold: 0.8
    })
  });
  return await response.json();
};

// 2. 获取预算摘要
const getSummary = async (tripId) => {
  const response = await fetch(`/api/trips/${tripId}/budget/summary`);
  return await response.json();
};
```

### 示例 2: 添加活动前检查预算预警

```javascript
const checkAlert = async (tripId, newItemCost) => {
  const response = await fetch(
    `/api/trips/${tripId}/budget/alert?cost=${newItemCost}`
  );
  const result = await response.json();
  
  if (result.data.hasAlert) {
    console.warn('预算预警:', result.data.alert.message);
    console.log('建议:', result.data.suggestions);
  }
  
  return result;
};
```

### 示例 3: 批量更新费用（旅行后记账）

```javascript
const batchUpdateCosts = async (tripId, updates) => {
  const response = await fetch('/api/itinerary-items/batch-cost', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId,
      updates: updates.map(item => ({
        itemId: item.id,
        actualCost: item.cost,
        isPaid: item.paid,
        paidBy: item.paidBy
      }))
    })
  });
  return await response.json();
};
```

---

## 注意事项

1. **预算约束**: 设置预算约束后，系统会在添加新活动时自动检查预算使用情况
2. **费用分类**: 系统会根据行程项类型自动分配费用分类，也可以手动指定
3. **货币单位**: 当前主要支持 CNY，其他货币单位需要确保汇率转换
4. **预算预警**: 当预算使用率达到 `alertThreshold`（默认 80%）时，系统会发出预警
5. **费用更新**: 支持预估费用和实际费用分别记录，便于预算规划和实际记账
