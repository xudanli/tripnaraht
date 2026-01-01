# 智能行程生成 API 接口文档

## 概述

本文档定义了智能行程生成系统的后端 API 接口，用于前端对接。核心原则：**LLM 只负责"选择与编排"，不负责"发明地点"**。所有行程项必须来自 `place` 表，确保可执行性和防幻觉。

---

## 基础信息

### Base URL
```
/api/trips
```

### 统一响应格式

所有接口都遵循统一的响应格式：

**成功响应**：
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应**：
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": { ... }
  }
}
```

### 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `VALIDATION_ERROR` | 400 | 输入数据验证失败 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `BUSINESS_ERROR` | 400/500 | 业务逻辑错误 |
| `INSUFFICIENT_CANDIDATES` | 400 | 候选地点不足（< 20个） |
| `VALIDATION_FAILED` | 400 | 规则校验失败 |
| `LLM_ERROR` | 500 | LLM 调用失败 |
| `PLACE_NOT_FOUND` | 404 | placeId 不存在 |
| `INVALID_SLOT` | 400 | 时段无效 |
| `LOCKED_ITEM_CONFLICT` | 400 | 锁定的 item 与新生成冲突 |

---

## 1. 生成行程草案

### `POST /trips/draft`

生成一个可预览的行程草案（不落库）。LLM 只负责从候选地点中选择和编排，不会编造地点。

#### 请求体

```typescript
{
  // 必选参数
  destination: string;        // 国家代码，如 "JP", "IS"
  days: number;                // 1-14 天
  
  // 可选参数
  style?: 'nature' | 'culture' | 'food' | 'citywalk' | 'photography' | 'adventure';
  intensity?: 'relaxed' | 'balanced' | 'intense';
  transport?: 'walk' | 'transit' | 'car';
  accommodationBase?: 'fixed' | 'moving';
  hikingLevel?: 'none' | 'light' | 'hiking-heavy';
  
  // 约束条件
  constraints?: {
    withChildren?: boolean;
    withElderly?: boolean;
    earlyRiser?: boolean;
    dietaryRestrictions?: string[];
    avoidCategories?: string[];  // 如: ['museum']
  };
  
  // 日期范围（可选，用于生成具体日期）
  startDate?: string;  // ISO 8601, 如 "2024-06-01"
  endDate?: string;    // ISO 8601
}
```

#### 请求示例

```json
{
  "destination": "JP",
  "days": 3,
  "style": "culture",
  "intensity": "balanced",
  "transport": "walk",
  "accommodationBase": "fixed",
  "hikingLevel": "none",
  "constraints": {
    "withElderly": true
  },
  "startDate": "2024-06-01",
  "endDate": "2024-06-03"
}
```

#### 响应体

```typescript
{
  success: true;
  data: {
    destination: string;
    days: number;
    startDate?: string;  // YYYY-MM-DD
    endDate?: string;    // YYYY-MM-DD
    
    draftDays: Array<{
      day: number;        // 1, 2, 3...
      date: string;       // YYYY-MM-DD
      slots: {
        morning?: DraftItineraryItem;      // 9:00-12:00
        lunch?: DraftItineraryItem;        // 12:00-13:30
        afternoon?: DraftItineraryItem;     // 13:30-17:30
        dinner?: DraftItineraryItem;        // 18:00-20:00
        evening?: DraftItineraryItem;       // 可选
      };
    }>;
    
    candidatesCount: number;  // 候选地点总数
    validationWarnings?: string[];  // 校验警告
    
    metadata?: {
      generationTime?: number;  // 毫秒
      llmProvider?: string;
    };
  };
}
```

#### DraftItineraryItem 结构

```typescript
{
  placeId: number;           // 必须来自 place 表
  slot: 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'evening';
  startTime: string;         // ISO 8601
  endTime: string;           // ISO 8601
  reason: string;            // 为什么选这个地点（短句，给UI用）
  alternatives?: number[];   // 备选 placeId 列表
  evidence?: {
    openingHours?: string;   // 如 "09:00-18:00"
    distance?: number;       // 米
    rating?: number;
    source?: string;         // 数据来源
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "destination": "JP",
    "days": 3,
    "startDate": "2024-06-01",
    "endDate": "2024-06-03",
    "draftDays": [
      {
        "day": 1,
        "date": "2024-06-01",
        "slots": {
          "morning": {
            "placeId": 123,
            "slot": "morning",
            "startTime": "2024-06-01T09:00:00.000Z",
            "endTime": "2024-06-01T12:00:00.000Z",
            "reason": "上午适合参观，避开人流高峰",
            "alternatives": [124, 125],
            "evidence": {
              "openingHours": "09:00-18:00",
              "rating": 4.5,
              "source": "database"
            }
          },
          "lunch": {
            "placeId": 456,
            "slot": "lunch",
            "startTime": "2024-06-01T12:00:00.000Z",
            "endTime": "2024-06-01T13:30:00.000Z",
            "reason": "附近知名日料，评分4.8",
            "alternatives": [457],
            "evidence": {
              "openingHours": "11:30-14:00",
              "rating": 4.8,
              "source": "database"
            }
          },
          "afternoon": { ... },
          "dinner": { ... }
        }
      },
      {
        "day": 2,
        "date": "2024-06-02",
        "slots": { ... }
      },
      {
        "day": 3,
        "date": "2024-06-03",
        "slots": { ... }
      }
    ],
    "candidatesCount": 156,
    "validationWarnings": [],
    "metadata": {
      "generationTime": 8542,
      "llmProvider": "openai"
    }
  }
}
```

#### 错误响应示例

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CANDIDATES",
    "message": "候选地点不足（15 个）。系统暂不支持该目的地，或该国家尚未导入足够的地点数据。"
  }
}
```

#### 业务逻辑

1. **固定时段骨架**：每天固定时段（morning, lunch, afternoon, dinner, evening）
2. **候选检索**：根据国家代码、风格等从数据库检索 50-200 个候选地点
3. **LLM 编排**：LLM 从候选中选择，不能编造 placeId
4. **规则校验**：验证营业时间、距离等（硬校验和软校验）
5. **返回草案**：返回可预览的行程草案，不落库

#### 性能要求

- 响应时间 < 10秒（包含 LLM 调用）

---

## 2. 保存草案为行程

### `POST /trips`

将草案保存为正式行程（创建 trip + 批量插入 itinerary_items）。

**注意**：此接口支持两种模式：
1. 标准创建：传入 `CreateTripDto`（原有功能）
2. 从草案保存：传入 `SaveTripDraftDto`（新功能）

系统会自动识别请求体类型。

#### 请求体（从草案保存）

```typescript
{
  draft: TripDraftResponse;  // 来自 /trips/draft 的响应
  
  userEdits?: {
    lockedItemIds?: string[];  // 已锁定的 itemId（如果有，在重生成时保持）
    removedItems?: string[];   // 移除的 item（格式：["1-morning", "2-lunch"]）
    addedItems?: DraftItineraryItem[];  // 新增的 item
  };
}
```

#### 请求示例

```json
{
  "draft": {
    "destination": "JP",
    "days": 3,
    "startDate": "2024-06-01",
    "endDate": "2024-06-03",
    "draftDays": [ ... ],
    "candidatesCount": 156
  },
  "userEdits": {
    "removedItems": ["1-evening"],
    "addedItems": []
  }
}
```

#### 响应体

```typescript
{
  success: true;
  data: {
    id: string;
    destination: string;
    startDate: string;
    endDate: string;
    totalBudget: number;
    status: 'PLANNING';
    pacingConfig?: PacingConfig;
    budgetConfig?: BudgetConfig;
    itemsCount: number;  // 创建的行程项数量
    days: Array<{
      id: string;
      date: string;
      ItineraryItem: Array<{
        id: string;
        placeId: number;
        type: 'ACTIVITY' | 'MEAL_ANCHOR' | 'MEAL_FLOATING' | 'REST' | 'TRANSIT';
        startTime: string;
        endTime: string;
        note: string;
        Place?: {
          id: number;
          nameCN: string;
          nameEN: string;
          category: string;
          rating: number;
        };
      }>;
    }>;
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "destination": "JP",
    "startDate": "2024-06-01",
    "endDate": "2024-06-03",
    "totalBudget": 20000,
    "itemsCount": 12,
    "days": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "date": "2024-06-01",
        "ItineraryItem": [
          {
            "id": "770e8400-e29b-41d4-a716-446655440002",
            "placeId": 123,
            "type": "ACTIVITY",
            "startTime": "2024-06-01T09:00:00.000Z",
            "endTime": "2024-06-01T12:00:00.000Z",
            "note": "上午适合参观，避开人流高峰",
            "Place": {
              "id": 123,
              "nameCN": "东京塔",
              "nameEN": "Tokyo Tower",
              "category": "ATTRACTION",
              "rating": 4.5
            }
          },
          { ... }
        ]
      },
      { ... }
    ]
  }
}
```

#### 业务逻辑

1. 创建 Trip 记录（如果草案中没有提供预算和旅行者信息，使用默认值）
2. 创建 TripDay 记录（每天一条）
3. 批量创建 ItineraryItem 记录：
   - 根据 slot 确定 type：
     - morning/afternoon/evening → `ACTIVITY`
     - lunch/dinner + RESTAURANT category → `MEAL_ANCHOR`
     - lunch/dinner + 其他 category → `MEAL_FLOATING`
4. 验证所有 placeId 存在
5. 处理用户编辑（移除项、新增项）

---

## 3. 替换单个行程项

### `POST /trips/:tripId/items/:itemId/replace`

Neptune 修复机制：替换单个行程项。

#### 路径参数

- `tripId`: 行程 ID (UUID)
- `itemId`: 行程项 ID (UUID)

#### 请求体

```typescript
{
  reason: 'too_tired' | 'weather_change' | 'change_style' | 'too_far' | 'closed' | 'other';
  
  preferredStyle?: 'nature' | 'culture' | 'food' | 'citywalk' | 'photography' | 'adventure';
  
  constraints?: {
    maxDistance?: number;  // 米
    mustBeOpen?: boolean;
    avoidCategories?: string[];
  };
}
```

#### 请求示例

```json
{
  "reason": "too_tired",
  "constraints": {
    "maxDistance": 2000
  }
}
```

#### 响应体

```typescript
{
  success: true;
  data: {
    newItem: DraftItineraryItem;
    
    alternatives: Array<{
      placeId: number;
      placeName: string;
      reason: string;
      score: number;  // 0-10
    }>;
    
    replacedItem: {
      placeId: number;
      reason: string;
    };
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "newItem": {
      "placeId": 789,
      "slot": "afternoon",
      "startTime": "2024-06-01T13:30:00.000Z",
      "endTime": "2024-06-01T17:30:00.000Z",
      "reason": "替代原地点：too_tired",
      "alternatives": [790, 791],
      "evidence": {
        "rating": 4.3,
        "source": "database"
      }
    },
    "alternatives": [
      {
        "placeId": 789,
        "placeName": "浅草寺",
        "reason": "评分 4.3",
        "score": 8.6
      },
      {
        "placeId": 790,
        "placeName": "上野公园",
        "reason": "评分 4.1",
        "score": 8.2
      }
    ],
    "replacedItem": {
      "placeId": 123,
      "reason": "too_tired"
    }
  }
}
```

#### 业务逻辑

1. 获取当前 item 信息（slot, day, 当前位置）
2. 根据 reason 调整检索策略：
   - `too_tired` → 找更轻松的地点（REST 类或 duration 短的）
   - `weather_change` → 找室内地点
   - `change_style` → 根据 preferredStyle 重新检索
   - `too_far` → 找更近的地点（maxDistance 约束）
   - `closed` → 排除已关闭的，找同类型替代
3. 从 place 表检索候选（50-100 个）
4. LLM 选择最佳替换（只允许从候选中选择）
5. 规则校验（营业时间、距离等）
6. 返回新 item + 备选方案（top 3-5）

#### 性能要求

- 响应时间 < 5秒

---

## 4. 全局重生成行程

### `POST /trips/:tripId/regenerate`

重生成整个行程，但保持用户已锁定的项。

#### 路径参数

- `tripId`: 行程 ID (UUID)

#### 请求体

```typescript
{
  lockedItemIds?: string[];  // 保持不变的 itemId
  
  newPreferences?: {
    style?: 'nature' | 'culture' | 'food' | 'citywalk' | 'photography' | 'adventure';
    intensity?: 'relaxed' | 'balanced' | 'intense';
    transport?: 'walk' | 'transit' | 'car';
    constraints?: {
      withChildren?: boolean;
      withElderly?: boolean;
      earlyRiser?: boolean;
      dietaryRestrictions?: string[];
      avoidCategories?: string[];
    };
  };
}
```

#### 请求示例

```json
{
  "lockedItemIds": ["770e8400-e29b-41d4-a716-446655440002"],
  "newPreferences": {
    "style": "food",
    "intensity": "relaxed"
  }
}
```

#### 响应体

```typescript
{
  success: true;
  data: {
    updatedDraft: TripDraftResponse;
    
    changes: Array<{
      type: 'added' | 'removed' | 'replaced' | 'moved';
      itemId?: string;
      placeId: number;
      placeName: string;
      day: number;
      slot: 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'evening';
      reason: string;
    }>;
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "updatedDraft": {
      "destination": "JP",
      "days": 3,
      "draftDays": [ ... ]
    },
    "changes": [
      {
        "type": "replaced",
        "itemId": "770e8400-e29b-41d4-a716-446655440003",
        "placeId": 456,
        "placeName": "原餐厅",
        "day": 1,
        "slot": "lunch",
        "reason": "根据新偏好（food风格）替换"
      },
      {
        "type": "added",
        "placeId": 999,
        "placeName": "新餐厅",
        "day": 2,
        "slot": "dinner",
        "reason": "新增美食体验"
      }
    ]
  }
}
```

#### 业务逻辑

1. 获取当前 trip 信息
2. 标记 lockedItemIds 对应的 item，在生成时保持不变
3. 对未锁定的 item，重新执行生成流程（候选检索 → LLM 编排 → 规则校验）
4. 对比新旧行程，生成 changes 列表
5. **不自动保存**，返回 updatedDraft 让用户确认

#### 性能要求

- 响应时间 < 15秒

---

## 使用流程示例

### 完整流程：生成 → 预览 → 保存

```typescript
// 1. 生成草案
const draftResponse = await fetch('/api/trips/draft', {
  method: 'POST',
  body: JSON.stringify({
    destination: 'JP',
    days: 3,
    style: 'culture',
    intensity: 'balanced',
    startDate: '2024-06-01',
    endDate: '2024-06-03'
  })
});

const draft = draftResponse.data;

// 2. 用户预览和编辑（前端处理）
// 用户可以：
// - 锁定某些项（添加到 lockedItemIds）
// - 删除某些项（添加到 removedItems）
// - 添加新项（添加到 addedItems）

// 3. 保存为正式行程
const tripResponse = await fetch('/api/trips', {
  method: 'POST',
  body: JSON.stringify({
    draft: draft,
    userEdits: {
      removedItems: ['1-evening'],
      addedItems: []
    }
  })
});

const trip = tripResponse.data;
```

### 替换单个项流程

```typescript
// 用户点击"替换"按钮，选择原因
const replaceResponse = await fetch(
  `/api/trips/${tripId}/items/${itemId}/replace`,
  {
    method: 'POST',
    body: JSON.stringify({
      reason: 'too_tired',
      constraints: {
        maxDistance: 2000
      }
    })
  }
);

const { newItem, alternatives } = replaceResponse.data;

// 前端显示新项和备选方案，用户确认后更新
```

### 重生成流程

```typescript
// 用户修改偏好后重生成
const regenerateResponse = await fetch(
  `/api/trips/${tripId}/regenerate`,
  {
    method: 'POST',
    body: JSON.stringify({
      lockedItemIds: ['item-id-1', 'item-id-2'],
      newPreferences: {
        style: 'food',
        intensity: 'relaxed'
      }
    })
  }
);

const { updatedDraft, changes } = regenerateResponse.data;

// 前端显示变更列表，用户确认后保存
```

---

## 时段定义

| 时段 | 时间范围 | 说明 |
|------|---------|------|
| `morning` | 9:00-12:00 | 上午活动 |
| `lunch` | 12:00-13:30 | 午餐 |
| `afternoon` | 13:30-17:30 | 下午活动 |
| `dinner` | 18:00-20:00 | 晚餐 |
| `evening` | 20:00-22:00 | 晚上活动（可选） |

---

## ItemType 映射规则

| 时段 | Place Category | ItemType |
|------|----------------|----------|
| morning/afternoon/evening | 任意 | `ACTIVITY` |
| lunch/dinner | `RESTAURANT` | `MEAL_ANCHOR` |
| lunch/dinner | 其他 | `MEAL_FLOATING` |

---

## 注意事项

1. **防幻觉**：
   - 所有 placeId 必须存在于数据库
   - LLM 输出必须经过 placeId 验证
   - 缺失 openingHours 的 place 不进入核心候选

2. **降级策略**：
   - 如果候选不足/数据缺：返回错误，提示用户
   - 如果 LLM 调用失败：返回错误，提示重试

3. **性能优化**：
   - 候选检索使用批量查询
   - ItineraryItem 批量创建使用事务

4. **数据一致性**：
   - 所有时间使用 ISO 8601 格式
   - 所有日期使用 YYYY-MM-DD 格式
   - 国家代码统一为大写（ISO 3166-1 alpha-2）

---

## 前端集成建议

### 1. 状态管理

建议使用以下状态结构：

```typescript
interface TripDraftState {
  draft: TripDraftResponse | null;
  isLoading: boolean;
  error: string | null;
  lockedItemIds: string[];
  removedItems: string[];
  addedItems: DraftItineraryItem[];
}
```

### 2. 错误处理

```typescript
try {
  const response = await fetch('/api/trips/draft', { ... });
  const result = await response.json();
  
  if (!result.success) {
    // 处理错误
    switch (result.error.code) {
      case 'INSUFFICIENT_CANDIDATES':
        // 显示友好提示，建议用户选择其他目的地
        break;
      case 'VALIDATION_FAILED':
        // 显示校验警告
        break;
      case 'LLM_ERROR':
        // 提示重试
        break;
    }
  }
} catch (error) {
  // 网络错误处理
}
```

### 3. 加载状态

- 生成草案：显示加载动画，预计 5-10 秒
- 保存行程：显示保存进度，预计 1-3 秒
- 替换项：显示加载动画，预计 3-5 秒
- 重生成：显示加载动画，预计 10-15 秒

### 4. 用户体验优化

- **预览模式**：草案生成后，先让用户预览和编辑，再保存
- **锁定功能**：允许用户锁定某些项，重生成时保持不变
- **变更对比**：重生成后，高亮显示变更项
- **备选方案**：替换项时，显示多个备选方案供用户选择

---

## 测试用例

### 测试场景 1：城市内 2-3 天游

```json
POST /api/trips/draft
{
  "destination": "JP",
  "days": 3,
  "style": "culture",
  "intensity": "balanced"
}
```

### 测试场景 2：数据不足降级

```json
POST /api/trips/draft
{
  "destination": "XX",  // 不支持的国家
  "days": 2
}
// 预期：返回 INSUFFICIENT_CANDIDATES 错误
```

### 测试场景 3：替换测试

```json
POST /api/trips/{tripId}/items/{itemId}/replace
{
  "reason": "too_tired",
  "constraints": {
    "maxDistance": 1000
  }
}
// 预期：返回新 item 和备选方案
```

---

## 更新日志

- **v1.0.0** (2024-06-01): 初始版本
  - 实现生成草案、保存行程、替换项、重生成四个核心接口
  - 支持 LLM 编排和规则校验
  - 完整的错误处理和类型安全

