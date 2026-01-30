# 证据与关注队列 API 接口文档

## 概述

本文档定义了证据列表和关注队列系统的后端 API 接口，用于前端对接。这两个接口主要用于：
- **EvidenceDrawer 组件**：显示行程的所有证据项
- **Dashboard 页面**：显示需要用户关注的事项队列

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

---

## 1. 获取行程证据列表

### `GET /trips/:id/evidence`

获取指定行程的所有证据项列表，用于 EvidenceDrawer 组件的证据标签页显示。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 行程ID (UUID) |

#### 查询参数（可选）

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| limit | number | 否 | 返回数量限制 | 50 |
| offset | number | 否 | 偏移量 | 0 |
| day | number | 否 | 筛选特定天数的证据（1-based） | - |
| type | string | 否 | 筛选特定类型的证据 | - |
| priority | string | 否 | 优先级过滤（P1功能）：`all`（全部）、`high`（高优先级）、`medium_and_high`（中等和高优先级） | `all` |
| groupBy | string | 否 | 分组方式（P1功能）：`none`（不分组）、`importance`（按重要性）、`type`（按类型）、`day`（按天数） | `none` |
| sortBy | string | 否 | 排序方式（P1功能）：`time`（按时间）、`importance`（按重要性）、`relevance`（按相关性）、`freshness`（按新鲜度）、`quality`（按质量评分） | `time` |

#### 证据类型（type）

| 值 | 说明 |
|----|------|
| `opening_hours` | 营业时间 |
| `road_closure` | 道路封闭 |
| `weather` | 天气 |
| `booking` | 预订 |
| `other` | 其他 |

#### 请求示例

```http
GET /api/trips/550e8400-e29b-41d4-a716-446655440000/evidence?limit=20&offset=0&day=1&type=opening_hours
```

#### 响应体

```typescript
{
  success: true;
  data: {
    items: EvidenceItem[];
    total: number;
    limit: number;
    offset: number;
  };
}
```

#### EvidenceItem 数据结构

```typescript
interface EvidenceItem {
  id: string;                    // 证据项ID
  type: 'opening_hours' | 'road_closure' | 'weather' | 'booking' | 'other';
  title: string;                 // 证据标题
  description: string;           // 证据描述
  source?: string;               // 数据来源（如 "Google Places API", "交通部门公告", "Weather API"）
  link?: string;                 // 相关链接（可选）
  timestamp: string;             // 时间戳（ISO 8601 格式）
  poiId?: string;                // 关联的POI ID（可选）
  day?: number;                  // 关联的行程天数（可选，1-based）
  severity?: 'low' | 'medium' | 'high';  // 严重程度（可选）
  metadata?: {                   // 额外元数据（可选）
    [key: string]: any;
  };
  // 🆕 P0修复：证据增强字段（v1.2.0）
  freshness?: {                  // 证据时效性信息（可选）
    fetchedAt: string;           // 获取时间（ISO 8601 格式）
    expiresAt?: string;          // 过期时间（ISO 8601 格式）
    freshnessStatus: 'FRESH' | 'STALE' | 'EXPIRED';  // 时效性状态
    recommendedRefreshAt?: string;  // 建议刷新时间（ISO 8601 格式）
  };
  confidence?: {                 // 证据置信度信息（可选）
    score: number;               // 置信度分数（0-1）
    level: 'HIGH' | 'MEDIUM' | 'LOW';  // 置信度等级
    factors: string[];           // 影响置信度的因素列表
  };
  qualityScore?: {               // 证据质量评分信息（可选）
    overallScore: number;        // 综合质量评分（0-1）
    components: {                 // 质量评分组件
      sourceReliability: number; // 数据源可靠性（0-1）
      timeliness: number;        // 时效性（0-1）
      completeness: number;      // 完整性（0-1）
      multiSourceVerification: number;  // 多源验证（0-1）
    };
    level: 'HIGH' | 'MEDIUM' | 'LOW';  // 质量等级
    explanation: string;         // 质量说明
  };
}
```

#### 响应示例

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
        "link": "https://maps.google.com/place/...",
        "timestamp": "2024-01-15T10:30:00Z",
        "poiId": "123",
        "day": 1,
        "severity": "low",
        "metadata": {
          "placeId": 123,
          "openingHours": {
            "monday": "09:00-22:00",
            "tuesday": "09:00-22:00"
          }
        },
        "freshness": {
          "fetchedAt": "2024-01-15T10:30:00Z",
          "expiresAt": "2024-01-16T10:30:00Z",
          "freshnessStatus": "FRESH",
          "recommendedRefreshAt": "2024-01-16T10:30:00Z"
        },
        "confidence": {
          "score": 0.85,
          "level": "HIGH",
          "factors": ["数据来源可靠", "数据新鲜", "数据完整"]
        },
        "qualityScore": {
          "overallScore": 0.85,
          "components": {
            "sourceReliability": 0.9,
            "timeliness": 1.0,
            "completeness": 0.9,
            "multiSourceVerification": 0.0
          },
          "level": "HIGH",
          "explanation": "高质量：数据来源可靠、数据新鲜、数据完整，综合评分 85/100"
        }
      },
      {
        "id": "ev-place-123-rating",
        "type": "other",
        "title": "地点评分",
        "description": "东京塔 评分：4.5",
        "source": "Google Places API",
        "timestamp": "2024-01-15T10:30:00Z",
        "poiId": "123",
        "day": 1,
        "severity": "low",
        "metadata": {
          "placeId": 123,
          "rating": 4.5
        }
      },
      {
        "id": "ev-evidenceRef-123-2024-01-15T10:30:00Z",
        "type": "other",
        "title": "决策证据",
        "description": "依据道路通行记录进行了风险提示",
        "source": "决策日志 (ABU)",
        "timestamp": "2024-01-15T10:30:00Z",
        "metadata": {
          "decisionSource": "PHYSICAL",
          "action": "REJECT",
          "reasonCodes": ["RISK_BASED"],
          "evidenceRef": "evidenceRef-123"
        }
      }
    ],
    "total": 3,
    "limit": 50,
    "offset": 0
  }
}
```

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "行程 ID 550e8400-e29b-41d4-a716-446655440000 不存在"
  }
}
```

#### 业务逻辑

1. **数据来源**：
   - 从决策日志（DecisionLog）中提取证据引用（evidenceRefs）
   - 从行程项的 Place 数据中提取营业时间、评分等信息
   - 未来可以扩展：交通部门API、Weather API、预订系统等

2. **过滤逻辑**：
   - 如果指定了 `day`，只返回该天的证据
   - 如果指定了 `type`，只返回该类型的证据
   - 支持组合过滤

3. **排序**（P1功能增强）：
   - 默认按时间戳倒序排列（最新的在前）
   - 支持按重要性排序（`sortBy=importance`）
   - 支持按相关性排序（`sortBy=relevance`，当前天数优先）
   - 支持按新鲜度排序（`sortBy=freshness`）
   - 支持按质量评分排序（`sortBy=quality`）

4. **优先级过滤**（P1功能）：
   - `priority=all`：显示所有证据（默认）
   - `priority=high`：只显示高优先级证据（重要性 >= 0.7）
   - `priority=medium_and_high`：显示中等和高优先级证据（重要性 >= 0.4）
   - 重要性计算基于：严重程度、时效性状态、质量评分、置信度

4. **分页**：
   - 支持 limit 和 offset 参数
   - 返回 total 总数用于前端分页计算

---

## 1.1 检查证据完整性（P1功能）

### `GET /trips/:id/evidence/completeness`

检查行程中所有POI的期望证据类型，识别缺失的证据，并提供补充建议。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 行程ID (UUID) |

#### 响应结构

```typescript
{
  completenessScore: number;  // 完整性评分（0-1）
  missingEvidence: Array<{
    poiId: number;
    poiName: string;
    missingTypes: EvidenceType[];
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    reason: string;
  }>;
  recommendations: Array<{
    action: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    estimatedTime: number;  // 秒
    evidenceTypes: EvidenceType[];
    affectedPois: number[];
  }>;
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "completenessScore": 0.75,
    "missingEvidence": [
      {
        "poiId": 123,
        "poiName": "蓝湖温泉",
        "missingTypes": ["weather", "opening_hours"],
        "impact": "MEDIUM",
        "reason": "景点需要营业时间信息、需要天气信息"
      },
      {
        "poiId": 456,
        "poiName": "F208公路",
        "missingTypes": ["road_closure"],
        "impact": "HIGH",
        "reason": "需要道路封闭信息（安全关键）"
      }
    ],
    "recommendations": [
      {
        "action": "为 5 个POI获取道路封闭信息",
        "priority": "HIGH",
        "estimatedTime": 8,
        "evidenceTypes": ["road_closure"],
        "affectedPois": [456, 789, 101]
      },
      {
        "action": "为 10 个POI获取天气数据",
        "priority": "MEDIUM",
        "estimatedTime": 12,
        "evidenceTypes": ["weather"],
        "affectedPois": [123, 124, 125]
      }
    ]
  }
}
```

#### 业务逻辑

1. **期望证据类型判断**：
   - 基于POI类别（ATTRACTION需要营业时间、NATURE需要天气）
   - 基于canonicalType（museum需要营业时间、hiking_trail需要天气和道路信息）
   - 考虑季节因素（冬季需要更多天气和道路信息）

2. **影响评估**：
   - HIGH：道路封闭信息（安全关键）
   - MEDIUM：天气信息（自然景点/冒险活动）、营业时间（景点/餐厅）
   - LOW：其他证据类型

3. **补充建议**：
   - 按证据类型分组
   - 按优先级排序
   - 提供时间估算

---

## 1.2 获取证据获取建议（智能触发，P1功能）

### `GET /trips/:id/evidence/suggestions`

自动检测缺失证据并生成获取建议，支持一键批量获取。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 行程ID (UUID) |

#### 响应结构

```typescript
{
  hasMissingEvidence: boolean;  // 是否有缺失证据
  completenessScore: number;    // 完整性评分（0-1）
  suggestions: Array<{
    id: string;
    description: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    evidenceTypes: EvidenceType[];
    affectedPoiIds: number[];
    estimatedTime: number;  // 秒
    reason: string;
    canBatchFetch: boolean;
  }>;
  bulkFetchSuggestion?: {      // 一键批量获取建议（可选）
    evidenceTypes: EvidenceType[];
    affectedPoiIds: number[];
    estimatedTime: number;
    description: string;
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "hasMissingEvidence": true,
    "completenessScore": 0.75,
    "suggestions": [
      {
        "id": "suggestion-road_closure-1234567890",
        "description": "为 5 个POI获取道路封闭信息",
        "priority": "HIGH",
        "evidenceTypes": ["road_closure"],
        "affectedPoiIds": [456, 789, 101],
        "estimatedTime": 8,
        "reason": "需要道路封闭信息（安全关键）",
        "canBatchFetch": true
      },
      {
        "id": "suggestion-weather-1234567891",
        "description": "为 10 个POI获取天气数据",
        "priority": "MEDIUM",
        "evidenceTypes": ["weather"],
        "affectedPoiIds": [123, 124, 125],
        "estimatedTime": 12,
        "reason": "自然景点/冒险活动需要天气信息",
        "canBatchFetch": true
      }
    ],
    "bulkFetchSuggestion": {
      "evidenceTypes": ["road_closure"],
      "affectedPoiIds": [456, 789, 101],
      "estimatedTime": 8,
      "description": "一键获取 1 项高优先级证据（3 个POI）"
    }
  }
}
```

#### 业务逻辑

1. **自动检测缺失证据**：
   - 调用完整性检查服务
   - 识别缺失的证据类型
   - 评估影响和优先级

2. **生成获取建议**：
   - 按证据类型分组
   - 按优先级排序（HIGH > MEDIUM > LOW）
   - 提供时间估算
   - 标记是否可批量获取

3. **一键批量获取建议**：
   - 只包含高优先级建议
   - 合并所有高优先级建议的证据类型和POI
   - 提供总时间估算

#### 使用场景

1. **准备度检查后**：
   - 自动调用此接口检查缺失证据
   - 显示获取建议
   - 提供一键批量获取按钮

2. **用户主动查看**：
   - 用户点击"检查缺失证据"
   - 显示建议列表
   - 用户选择性地获取证据

3. **自动触发**：
   - 调用 `shouldAutoTrigger` 方法检查是否应该自动触发
   - 如果完整性评分低于阈值（默认0.7）或有高优先级缺失，建议自动触发

---

## 2. 获取关注队列

### `GET /trips/attention-queue`

获取需要用户关注的队列列表，用于 Dashboard 页面的 Attention Queue 显示。支持全局查询（所有行程）或按 tripId 过滤。

#### 查询参数（可选）

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| limit | number | 否 | 返回数量限制 | 20 |
| offset | number | 否 | 偏移量 | 0 |
| severity | string | 否 | 筛选严重程度 | - |
| type | string | 否 | 筛选类型 | - |
| tripId | string | 否 | 筛选特定行程ID | - |

#### 严重程度（severity）

| 值 | 说明 | 优先级 |
|----|------|--------|
| `critical` | 严重 | 4 |
| `high` | 高 | 3 |
| `medium` | 中等 | 2 |
| `low` | 低 | 1 |

#### 关注项类型（type）

| 值 | 说明 |
|----|------|
| `schedule_conflict` | 时间窗冲突 |
| `road_closed` | 道路封闭 |
| `weather_risk` | 天气风险 |
| `budget_alert` | 预算提醒 |
| `safety_risk` | 安全风险 |
| `booking_issue` | 预订问题 |
| `other` | 其他 |

#### 请求示例

**全局查询**：
```http
GET /api/trips/attention-queue?limit=20&offset=0&severity=high
```

**特定行程查询**：
```http
GET /api/trips/attention-queue?tripId=550e8400-e29b-41d4-a716-446655440000&limit=10
```

#### 响应体

```typescript
{
  success: true;
  data: {
    items: AttentionItem[];
    total: number;
    limit: number;
    offset: number;
  };
}
```

#### AttentionItem 数据结构

```typescript
interface AttentionItem {
  id: string;                    // 关注项ID
  type: 'schedule_conflict' | 'road_closed' | 'weather_risk' | 'budget_alert' | 'safety_risk' | 'booking_issue' | 'other';
  title: string;                 // 标题
  description?: string;          // 详细描述（可选）
  tripId: string;                // 关联的行程ID
  severity: 'critical' | 'high' | 'medium' | 'low';  // 严重程度
  createdAt: string;             // 创建时间（ISO 8601 格式）
  updatedAt?: string;            // 更新时间（可选）
  status?: 'new' | 'acknowledged' | 'resolved';  // 状态（可选）
  metadata?: {                   // 额外元数据（可选）
    day?: number;                // 关联的行程天数
    poiId?: string;              // 关联的POI ID
    evidenceIds?: string[];      // 关联的证据ID列表
    actionUrl?: string;          // 建议的操作链接（可选）
    persona?: string;            // Persona类型（ABU, DR_DRE, NEPTUNE）
    [key: string]: any;
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "alert-2024-01-15T10:30:00Z",
        "type": "schedule_conflict",
        "title": "节奏官（HUMAN）",
        "description": "第 1 天行程稍密集\n如果你想更轻松，我建议拆成两天\n这样会舒服一点",
        "tripId": "550e8400-e29b-41d4-a716-446655440000",
        "severity": "high",
        "createdAt": "2024-01-15T10:30:00Z",
        "status": "new",
        "metadata": {
          "day": 1,
          "suggestion": "SPLIT_DAY",
          "itemCount": 9,
          "persona": "DR_DRE",
          "actionUrl": "/dashboard/trips/550e8400-e29b-41d4-a716-446655440000"
        }
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440000-alert-2024-01-15T11:00:00Z",
        "type": "safety_risk",
        "title": "安全官（PHYSICAL）",
        "description": "我注意到北部山区 10 月份道路封闭概率较高\n建议准备备选路线\n你觉得呢？",
        "tripId": "550e8400-e29b-41d4-a716-446655440000",
        "severity": "high",
        "createdAt": "2024-01-15T11:00:00Z",
        "status": "new",
        "metadata": {
          "decisionSource": "PHYSICAL",
          "action": "REJECT",
          "reasonCodes": ["RISK_BASED"],
          "persona": "ABU",
          "actionUrl": "/dashboard/trips/550e8400-e29b-41d4-a716-446655440000?tab=risk"
        }
      }
    ],
    "total": 2,
    "limit": 20,
    "offset": 0
  }
}
```

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "获取关注队列失败",
    "details": {
      "originalError": "..."
    }
  }
}
```

#### 业务逻辑

1. **数据来源**：
   - 从 Persona Alerts（三人格提醒）中提取
   - 基于决策日志（DecisionLog）生成
   - 未来可以扩展：Risk Items、Readiness Check 结果等

2. **Persona 到 AttentionItem 的映射**：
   - `ABU` → `safety_risk`（安全风险）
   - `DR_DRE` → `schedule_conflict`（时间窗冲突）
   - `NEPTUNE` → `other`（其他）

3. **严重程度映射**：
   - `WARNING` → `high`
   - `INFO` → `medium`
   - `SUCCESS` → `low`

4. **排序逻辑**：
   - 首先按严重程度排序（critical > high > medium > low）
   - 相同严重程度按创建时间倒序（最新的在前）

5. **全局查询**：
   - 如果不指定 `tripId`，查询最近更新的 10 个行程
   - 聚合所有行程的关注项
   - 性能考虑：限制查询数量，避免超时

6. **过滤逻辑**：
   - 支持按 `severity` 过滤
   - 支持按 `type` 过滤
   - 支持按 `tripId` 过滤

---

## 使用场景

### 场景 1：EvidenceDrawer 组件

在行程详情页的 EvidenceDrawer 组件中显示证据列表：

```typescript
// 获取所有证据
const { data } = await fetch('/api/trips/trip-id/evidence');
const evidenceItems = data.items;

// 按类型分组显示
const groupedByType = evidenceItems.reduce((acc, item) => {
  if (!acc[item.type]) acc[item.type] = [];
  acc[item.type].push(item);
  return acc;
}, {});

// 按天数分组显示
const groupedByDay = evidenceItems.reduce((acc, item) => {
  const day = item.day || 'other';
  if (!acc[day]) acc[day] = [];
  acc[day].push(item);
  return acc;
}, {});
```

### 场景 2：Dashboard 页面

在 Dashboard 页面显示关注队列：

```typescript
// 获取全局关注队列
const { data } = await fetch('/api/trips/attention-queue?limit=20');
const attentionItems = data.items;

// 按严重程度分组
const criticalItems = attentionItems.filter(item => item.severity === 'critical');
const highItems = attentionItems.filter(item => item.severity === 'high');

// 显示优先级最高的项
const topPriority = attentionItems[0];
```

### 场景 3：特定行程的关注项

在行程详情页显示该行程的关注项：

```typescript
// 获取特定行程的关注项
const { data } = await fetch(
  `/api/trips/attention-queue?tripId=${tripId}&limit=10`
);
const tripAttentionItems = data.items;
```

---

## TypeScript 类型定义

```typescript
// 证据类型
export enum EvidenceType {
  OPENING_HOURS = 'opening_hours',
  ROAD_CLOSURE = 'road_closure',
  WEATHER = 'weather',
  BOOKING = 'booking',
  OTHER = 'other',
}

export enum EvidenceSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  title: string;
  description: string;
  source?: string;
  link?: string;
  timestamp: string;
  poiId?: string;
  day?: number;
  severity?: EvidenceSeverity;
  metadata?: Record<string, any>;
}

export interface EvidenceListResponse {
  items: EvidenceItem[];
  total: number;
  limit: number;
  offset: number;
}

// 关注队列类型
export enum AttentionItemType {
  SCHEDULE_CONFLICT = 'schedule_conflict',
  ROAD_CLOSED = 'road_closed',
  WEATHER_RISK = 'weather_risk',
  BUDGET_ALERT = 'budget_alert',
  SAFETY_RISK = 'safety_risk',
  BOOKING_ISSUE = 'booking_issue',
  OTHER = 'other',
}

export enum AttentionSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum AttentionStatus {
  NEW = 'new',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}

export interface AttentionItem {
  id: string;
  type: AttentionItemType;
  title: string;
  description?: string;
  tripId: string;
  severity: AttentionSeverity;
  createdAt: string;
  updatedAt?: string;
  status?: AttentionStatus;
  metadata?: {
    day?: number;
    poiId?: string;
    evidenceIds?: string[];
    actionUrl?: string;
    persona?: string;
    [key: string]: any;
  };
}

export interface AttentionQueueResponse {
  items: AttentionItem[];
  total: number;
  limit: number;
  offset: number;
}
```

---

## 前端集成示例

### React Hook 示例

```typescript
import { useState, useEffect } from 'react';

// 获取证据列表
function useEvidence(tripId: string, filters?: {
  limit?: number;
  offset?: number;
  day?: number;
  type?: EvidenceType;
}) {
  const [evidence, setEvidence] = useState<EvidenceListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvidence = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams();
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());
        if (filters?.day) params.append('day', filters.day.toString());
        if (filters?.type) params.append('type', filters.type);

        const response = await fetch(
          `/api/trips/${tripId}/evidence?${params.toString()}`
        );
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error.message);
        }
        
        setEvidence(result.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (tripId) {
      fetchEvidence();
    }
  }, [tripId, filters]);

  return { evidence, loading, error };
}

// 获取关注队列
function useAttentionQueue(filters?: {
  limit?: number;
  offset?: number;
  severity?: AttentionSeverity;
  type?: AttentionItemType;
  tripId?: string;
}) {
  const [attentionQueue, setAttentionQueue] = useState<AttentionQueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAttentionQueue = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams();
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.offset) params.append('offset', filters.offset.toString());
        if (filters?.severity) params.append('severity', filters.severity);
        if (filters?.type) params.append('type', filters.type);
        if (filters?.tripId) params.append('tripId', filters.tripId);

        const response = await fetch(
          `/api/trips/attention-queue?${params.toString()}`
        );
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error.message);
        }
        
        setAttentionQueue(result.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAttentionQueue();
  }, [filters]);

  return { attentionQueue, loading, error };
}
```

### 使用示例

```typescript
// 在组件中使用
function EvidenceDrawer({ tripId }: { tripId: string }) {
  const { evidence, loading, error } = useEvidence(tripId, {
    limit: 50,
    day: 1, // 只显示第1天的证据
  });

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!evidence) return null;

  return (
    <div>
      <h3>证据列表 (共 {evidence.total} 条)</h3>
      {evidence.items.map(item => (
        <div key={item.id}>
          <h4>{item.title}</h4>
          <p>{item.description}</p>
          {item.source && <span>来源: {item.source}</span>}
        </div>
      ))}
    </div>
  );
}

function AttentionQueue({ tripId?: string }) {
  const { attentionQueue, loading, error } = useAttentionQueue({
    limit: 20,
    severity: 'high', // 只显示高优先级
    tripId, // 可选：特定行程
  });

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!attentionQueue) return null;

  return (
    <div>
      <h3>关注队列 (共 {attentionQueue.total} 条)</h3>
      {attentionQueue.items.map(item => (
        <div key={item.id} className={`severity-${item.severity}`}>
          <h4>{item.title}</h4>
          {item.description && <p>{item.description}</p>}
          {item.metadata?.actionUrl && (
            <a href={item.metadata.actionUrl}>查看详情</a>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## 错误处理

### 常见错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `NOT_FOUND` | 404 | 行程不存在 |
| `VALIDATION_ERROR` | 400 | 查询参数验证失败 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 错误处理示例

```typescript
try {
  const response = await fetch('/api/trips/trip-id/evidence');
  const result = await response.json();
  
  if (!result.success) {
    switch (result.error.code) {
      case 'NOT_FOUND':
        // 显示友好提示
        console.error('行程不存在');
        break;
      case 'VALIDATION_ERROR':
        // 显示参数错误
        console.error('查询参数无效:', result.error.message);
        break;
      default:
        // 显示通用错误
        console.error('获取证据失败:', result.error.message);
    }
  }
} catch (error) {
  // 网络错误处理
  console.error('网络错误:', error);
}
```

---

## 性能优化建议

1. **分页加载**：
   - 默认 limit 为 50（证据）和 20（关注队列）
   - 建议前端实现虚拟滚动或分页加载

2. **缓存策略**：
   - 关注队列可以缓存 5-10 分钟
   - 证据列表可以缓存更长时间（因为变化较少）

3. **按需加载**：
   - 只在用户打开 EvidenceDrawer 时加载证据
   - Dashboard 页面可以延迟加载关注队列

4. **过滤优化**：
   - 如果只需要特定类型或天数的证据，使用查询参数过滤
   - 减少不必要的数据传输

---

## 注意事项

1. **权限控制**：
   - 确保用户只能访问自己拥有的行程数据
   - 全局关注队列只返回用户有权限的行程

2. **数据一致性**：
   - 证据数据与决策日志、风险项等数据保持一致
   - 关注队列反映最新的状态

3. **实时性**：
   - 关注队列应该反映最新的状态
   - 建议支持实时更新或轮询（每 30 秒-1 分钟）

4. **扩展性**：
   - 证据数据来源可以扩展（交通部门API、Weather API等）
   - 关注队列可以集成更多数据源（Risk Items、Readiness Check等）

---

---

## 3. 更新单个证据项状态

### `PATCH /trips/:id/evidence/:evidenceId`

更新指定证据项的状态和用户备注。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 行程ID (UUID) |
| evidenceId | string | 是 | 证据项ID |

#### 请求体

```typescript
{
  status?: 'new' | 'acknowledged' | 'resolved' | 'dismissed';  // 可选：证据状态
  userNote?: string;                                           // 可选：用户备注（最大500字符）
}
```

#### 请求示例

```http
PATCH /api/trips/550e8400-e29b-41d4-a716-446655440000/evidence/ev-place-123-opening-hours
Content-Type: application/json

{
  "status": "acknowledged",
  "userNote": "已确认营业时间，已准备备选方案"
}
```

#### 响应体

```typescript
{
  success: true;
  data: {
    evidenceId: string;
    status: string;
    updatedAt: string;
    userNote?: string;
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "evidenceId": "ev-place-123-opening-hours",
    "status": "acknowledged",
    "updatedAt": "2026-01-29T12:00:00Z",
    "userNote": "已确认营业时间，已准备备选方案"
  }
}
```

#### 状态转换规则

| 当前状态 | 允许转换到 | 说明 |
|---------|-----------|------|
| `new` | `acknowledged`, `resolved`, `dismissed` | 新证据可以标记为已读、已解决或忽略 |
| `acknowledged` | `resolved`, `dismissed` | 已读可以标记为已解决或忽略 |
| `resolved` | - | 已解决不能回退 |
| `dismissed` | `acknowledged` | 忽略的可以重新关注 |

#### 权限要求

- 只有 **OWNER** 和 **EDITOR** 可以修改证据
- **VIEWER** 只能查看，不能修改

#### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "不允许的状态转换：resolved → acknowledged"
  }
}
```

---

## 4. 批量更新证据项状态

### `PUT /trips/:id/evidence/batch-update`

批量更新多个证据项的状态和备注。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 行程ID (UUID) |

#### 请求体

```typescript
{
  updates: Array<{
    evidenceId: string;
    status?: 'new' | 'acknowledged' | 'resolved' | 'dismissed';
    userNote?: string;
  }>;
}
```

#### 请求示例

```http
PUT /api/trips/550e8400-e29b-41d4-a716-446655440000/evidence/batch-update
Content-Type: application/json

{
  "updates": [
    {
      "evidenceId": "ev-place-123-opening-hours",
      "status": "acknowledged",
      "userNote": "已确认"
    },
    {
      "evidenceId": "ev-place-456-weather",
      "status": "resolved",
      "userNote": "已准备雨具"
    }
  ]
}
```

#### 响应体

```typescript
{
  success: true;
  data: {
    updated: number;
    failed: number;
    errors?: Array<{
      evidenceId: string;
      error: string;
    }>;
  };
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "updated": 2,
    "failed": 0
  }
}
```

#### 批量限制

- 最多支持 **100个** 证据项批量更新
- 超过限制会返回 `VALIDATION_ERROR` 错误

#### 部分失败处理

如果部分更新失败，响应会包含失败详情：

```json
{
  "success": true,
  "data": {
    "updated": 1,
    "failed": 1,
    "errors": [
      {
        "evidenceId": "ev-place-999-opening-hours",
        "error": "证据项不存在"
      }
    ]
  }
}
```

---

## 更新日志

- **v1.6.0** (2026-01-29): P1修复 - 进度反馈和预期管理
  - 新增 `POST /api/planning-workbench/trips/:tripId/fetch-evidence?async=true` 异步模式
  - 新增 `GET /api/planning-workbench/tasks/:taskId/progress` 任务进度查询接口
  - 新增 `POST /api/planning-workbench/tasks/:taskId/cancel` 任务取消接口
  - 支持任务进度跟踪（处理数量、当前POI、预计剩余时间）
  - 支持任务状态管理（PENDING/RUNNING/COMPLETED/FAILED/CANCELLED）
  - 自动计算预计剩余时间
  - 注意：当前为简化实现，使用内存存储

- **v1.5.0** (2026-01-29): P1修复 - 智能触发机制
  - 新增 `GET /trips/:id/evidence/suggestions` 接口
  - 自动检测缺失证据并生成获取建议
  - 支持一键批量获取建议（高优先级）
  - 提供时间估算和优先级排序
  - 支持自动触发判断（`shouldAutoTrigger`方法）

- **v1.4.0** (2026-01-29): P1修复 - 证据完整性检查
  - 新增 `GET /trips/:id/evidence/completeness` 接口
  - 检查期望的证据类型（基于POI类别、canonicalType、季节）
  - 识别缺失的证据并评估影响（HIGH/MEDIUM/LOW）
  - 提供补充建议（按优先级排序、时间估算）
  - 计算完整性评分（0-1）

- **v1.3.0** (2026-01-29): P1修复 - 证据过滤和优先级机制
  - 新增 `priority` 查询参数：支持按优先级过滤证据（all/high/medium_and_high）
  - 新增 `groupBy` 查询参数：支持按重要性、类型、天数分组（暂未在响应中实现分组结构）
  - 新增 `sortBy` 查询参数：支持按重要性、相关性、新鲜度、质量评分排序
  - 实现智能重要性计算：基于严重程度、时效性状态、质量评分、置信度
  - 默认保持向后兼容（所有新参数可选）

- **v1.2.0** (2026-01-29): P0修复 - 证据增强功能
  - 新增 `freshness` 字段：证据时效性信息（获取时间、过期时间、时效性状态）
  - 新增 `confidence` 字段：证据置信度信息（置信度分数、等级、影响因素）
  - 新增 `qualityScore` 字段：证据质量评分信息（综合评分、组件评分、质量等级、说明）
  - 自动计算不同证据类型的TTL（天气30分钟、道路封闭1小时、营业时间24小时）
  - 基于数据源可靠性、时效性、完整性、多源验证计算质量评分
  - 所有字段均为可选，保持向后兼容

- **v1.1.0** (2026-01-29): 新增证据修改接口
  - 实现更新单个证据项状态接口 (`PATCH /trips/:id/evidence/:evidenceId`)
  - 实现批量更新证据项状态接口 (`PUT /trips/:id/evidence/batch-update`)
  - 支持状态转换校验和权限控制
  - `GET /trips/:id/evidence` 接口现在返回状态信息

- **v1.0.0** (2024-01-15): 初始版本
  - 实现获取证据列表接口
  - 实现获取关注队列接口
  - 支持分页、过滤、排序功能

