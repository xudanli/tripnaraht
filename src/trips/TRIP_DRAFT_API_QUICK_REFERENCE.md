# 智能行程生成 API - 快速参考

## 接口列表

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/trips/draft` | POST | 生成行程草案 |
| `/api/trips` | POST | 保存草案为行程（或标准创建） |
| `/api/trips/:tripId/items/:itemId/replace` | POST | 替换单个行程项 |
| `/api/trips/:tripId/regenerate` | POST | 全局重生成行程 |

---

## 1. 生成行程草案

```http
POST /api/trips/draft
Content-Type: application/json

{
  "destination": "JP",
  "days": 3,
  "style": "culture",
  "intensity": "balanced",
  "transport": "walk",
  "startDate": "2024-06-01",
  "endDate": "2024-06-03"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "destination": "JP",
    "days": 3,
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
            "reason": "上午适合参观",
            "alternatives": [124, 125],
            "evidence": { "rating": 4.5 }
          },
          "lunch": { ... },
          "afternoon": { ... },
          "dinner": { ... }
        }
      }
    ],
    "candidatesCount": 156
  }
}
```

---

## 2. 保存草案为行程

```http
POST /api/trips
Content-Type: application/json

{
  "draft": { ... },  // 来自 /trips/draft 的响应
  "userEdits": {
    "removedItems": ["1-evening"],
    "addedItems": []
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "destination": "JP",
    "startDate": "2024-06-01",
    "endDate": "2024-06-03",
    "itemsCount": 12,
    "days": [ ... ]
  }
}
```

---

## 3. 替换单个行程项

```http
POST /api/trips/:tripId/items/:itemId/replace
Content-Type: application/json

{
  "reason": "too_tired",
  "constraints": {
    "maxDistance": 2000
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "newItem": {
      "placeId": 789,
      "slot": "afternoon",
      "startTime": "2024-06-01T13:30:00.000Z",
      "endTime": "2024-06-01T17:30:00.000Z",
      "reason": "替代原地点：too_tired"
    },
    "alternatives": [
      {
        "placeId": 789,
        "placeName": "浅草寺",
        "reason": "评分 4.3",
        "score": 8.6
      }
    ],
    "replacedItem": {
      "placeId": 123,
      "reason": "too_tired"
    }
  }
}
```

---

## 4. 全局重生成行程

```http
POST /api/trips/:tripId/regenerate
Content-Type: application/json

{
  "lockedItemIds": ["item-id-1"],
  "newPreferences": {
    "style": "food",
    "intensity": "relaxed"
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "updatedDraft": { ... },
    "changes": [
      {
        "type": "replaced",
        "placeId": 456,
        "placeName": "原餐厅",
        "day": 1,
        "slot": "lunch",
        "reason": "根据新偏好替换"
      }
    ]
  }
}
```

---

## 枚举值

### TravelStyle
- `nature` - 自然风光
- `culture` - 文化历史
- `food` - 美食
- `citywalk` - 城市漫步
- `photography` - 摄影
- `adventure` - 冒险

### IntensityLevel
- `relaxed` - 轻松
- `balanced` - 平衡
- `intense` - 紧凑

### TransportMode
- `walk` - 步行
- `transit` - 公共交通
- `car` - 自驾

### ReplaceReason
- `too_tired` - 太累
- `weather_change` - 天气变化
- `change_style` - 改变风格
- `too_far` - 太远
- `closed` - 已关闭
- `other` - 其他

### TimeSlot
- `morning` - 9:00-12:00
- `lunch` - 12:00-13:30
- `afternoon` - 13:30-17:30
- `dinner` - 18:00-20:00
- `evening` - 20:00-22:00

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| `VALIDATION_ERROR` | 输入验证失败 |
| `NOT_FOUND` | 资源不存在 |
| `INSUFFICIENT_CANDIDATES` | 候选地点不足 |
| `VALIDATION_FAILED` | 规则校验失败 |
| `LLM_ERROR` | LLM 调用失败 |
| `PLACE_NOT_FOUND` | 地点不存在 |

---

## TypeScript 类型定义

```typescript
// 生成草案请求
interface CreateTripDraftRequest {
  destination: string;
  days: number;
  style?: TravelStyle;
  intensity?: IntensityLevel;
  transport?: TransportMode;
  accommodationBase?: AccommodationBase;
  hikingLevel?: HikingLevel;
  constraints?: {
    withChildren?: boolean;
    withElderly?: boolean;
    earlyRiser?: boolean;
    dietaryRestrictions?: string[];
    avoidCategories?: string[];
  };
  startDate?: string;
  endDate?: string;
}

// 草案项
interface DraftItineraryItem {
  placeId: number;
  slot: TimeSlot;
  startTime: string;
  endTime: string;
  reason: string;
  alternatives?: number[];
  evidence?: {
    openingHours?: string;
    distance?: number;
    rating?: number;
    source?: string;
  };
}

// 保存草案请求
interface SaveTripDraftRequest {
  draft: TripDraftResponse;
  userEdits?: {
    lockedItemIds?: string[];
    removedItems?: string[];
    addedItems?: DraftItineraryItem[];
  };
}

// 替换项请求
interface ReplaceItemRequest {
  reason: 'too_tired' | 'weather_change' | 'change_style' | 'too_far' | 'closed' | 'other';
  preferredStyle?: TravelStyle;
  constraints?: {
    maxDistance?: number;
    mustBeOpen?: boolean;
    avoidCategories?: string[];
  };
}

// 重生成请求
interface RegenerateTripRequest {
  lockedItemIds?: string[];
  newPreferences?: {
    style?: TravelStyle;
    intensity?: IntensityLevel;
    transport?: TransportMode;
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

---

## 前端集成示例

### React Hook 示例

```typescript
import { useState } from 'react';

function useTripDraft() {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateDraft = async (params: CreateTripDraftRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/trips/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      setDraft(result.data);
      return result.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const saveDraft = async (draft: TripDraftResponse, userEdits?: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, userEdits }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error.message);
      }
      
      return result.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { draft, loading, error, generateDraft, saveDraft };
}
```

---

## 常见问题

**Q: 草案生成需要多长时间？**
A: 通常 5-10 秒，取决于候选地点数量和 LLM 响应时间。

**Q: 可以修改草案后再保存吗？**
A: 可以，通过 `userEdits` 参数可以移除项、添加项或锁定项。

**Q: 替换项时如何选择备选方案？**
A: 系统会返回多个备选方案（按评分排序），前端可以让用户选择。

**Q: 重生成会覆盖所有项吗？**
A: 不会，通过 `lockedItemIds` 可以锁定某些项保持不变。

**Q: 如何处理错误？**
A: 所有错误都遵循统一格式，检查 `success` 字段和 `error.code` 字段。

---

详细文档请参考：`TRIP_DRAFT_API.md`

