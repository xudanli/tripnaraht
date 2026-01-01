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

3. **排序**：
   - 按时间戳倒序排列（最新的在前）

4. **分页**：
   - 支持 limit 和 offset 参数
   - 返回 total 总数用于前端分页计算

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

## 更新日志

- **v1.0.0** (2024-01-15): 初始版本
  - 实现获取证据列表接口
  - 实现获取关注队列接口
  - 支持分页、过滤、排序功能

