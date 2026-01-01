# 证据与关注队列 API - 快速参考

## 接口列表

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/trips/:id/evidence` | GET | 获取行程证据列表 |
| `/api/trips/attention-queue` | GET | 获取关注队列 |

---

## 1. 获取行程证据列表

```http
GET /api/trips/:id/evidence?limit=50&offset=0&day=1&type=opening_hours
```

**查询参数**：
- `limit` (number, 可选): 返回数量限制，默认 50
- `offset` (number, 可选): 偏移量，默认 0
- `day` (number, 可选): 筛选特定天数（1-based）
- `type` (string, 可选): 筛选类型（opening_hours, road_closure, weather, booking, other）

**响应**：
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "ev-place-123-opening-hours",
        "type": "opening_hours",
        "title": "营业时间",
        "description": "东京塔 营业时间：09:00-22:00",
        "source": "Google Places API",
        "timestamp": "2024-01-15T10:30:00Z",
        "poiId": "123",
        "day": 1,
        "severity": "low"
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

---

## 2. 获取关注队列

```http
GET /api/trips/attention-queue?limit=20&offset=0&severity=high&tripId=trip-id
```

**查询参数**：
- `limit` (number, 可选): 返回数量限制，默认 20
- `offset` (number, 可选): 偏移量，默认 0
- `severity` (string, 可选): 筛选严重程度（critical, high, medium, low）
- `type` (string, 可选): 筛选类型（schedule_conflict, road_closed, weather_risk, budget_alert, safety_risk, booking_issue, other）
- `tripId` (string, 可选): 筛选特定行程ID

**响应**：
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "alert-2024-01-15T10:30:00Z",
        "type": "schedule_conflict",
        "title": "节奏官（HUMAN）",
        "description": "第 1 天行程稍密集",
        "tripId": "trip-id",
        "severity": "high",
        "createdAt": "2024-01-15T10:30:00Z",
        "status": "new",
        "metadata": {
          "day": 1,
          "persona": "DR_DRE",
          "actionUrl": "/dashboard/trips/trip-id"
        }
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

---

## 枚举值

### EvidenceType
- `opening_hours` - 营业时间
- `road_closure` - 道路封闭
- `weather` - 天气
- `booking` - 预订
- `other` - 其他

### EvidenceSeverity
- `low` - 低
- `medium` - 中
- `high` - 高

### AttentionItemType
- `schedule_conflict` - 时间窗冲突
- `road_closed` - 道路封闭
- `weather_risk` - 天气风险
- `budget_alert` - 预算提醒
- `safety_risk` - 安全风险
- `booking_issue` - 预订问题
- `other` - 其他

### AttentionSeverity
- `critical` - 严重
- `high` - 高
- `medium` - 中等
- `low` - 低

### AttentionStatus
- `new` - 新建
- `acknowledged` - 已确认
- `resolved` - 已解决

---

## 快速集成代码

```typescript
// 获取证据列表
const getEvidence = async (tripId: string, filters?: {
  limit?: number;
  offset?: number;
  day?: number;
  type?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  if (filters?.day) params.append('day', filters.day.toString());
  if (filters?.type) params.append('type', filters.type);

  const response = await fetch(`/api/trips/${tripId}/evidence?${params}`);
  const result = await response.json();
  return result.success ? result.data : null;
};

// 获取关注队列
const getAttentionQueue = async (filters?: {
  limit?: number;
  offset?: number;
  severity?: string;
  type?: string;
  tripId?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());
  if (filters?.severity) params.append('severity', filters.severity);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.tripId) params.append('tripId', filters.tripId);

  const response = await fetch(`/api/trips/attention-queue?${params}`);
  const result = await response.json();
  return result.success ? result.data : null;
};
```

---

详细文档请参考：`EVIDENCE_ATTENTION_API.md`

