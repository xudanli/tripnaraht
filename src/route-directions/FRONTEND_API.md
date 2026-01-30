# 路线模板 API - 前端对接文档

## 概述

本文档提供路线模板相关 API 的前端对接指南，包含所有接口的详细说明、请求/响应格式和示例代码。

## 基础信息

- **基础路径**: `/route-directions/templates`
- **API 版本**: v1
- **响应格式**: 统一使用标准响应格式
- **认证**: 根据项目配置（如需要）

### 标准响应格式

```typescript
// 成功响应
{
  "success": true,
  "data": { ... },
  "error": null
}

// 错误响应
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": { ... }
  }
}
```

---

## API 接口列表

### 1. 查询路线模板列表

获取路线模板列表，支持多条件筛选。

**接口**: `GET /route-directions/templates`

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| routeDirectionId | number | 否 | 按路线方向ID筛选 |
| durationDays | number | 否 | 按行程天数筛选 |
| isActive | boolean | 否 | 按激活状态筛选（true/false） |
| limit | number | 否 | 返回数量限制（默认不限制） |
| offset | number | 否 | 偏移量（用于分页） |

**请求示例**:

```typescript
// TypeScript
const response = await fetch('/route-directions/templates?routeDirectionId=1&durationDays=7&isActive=true&limit=10', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
});

const result = await response.json();
```

```javascript
// JavaScript
const params = new URLSearchParams({
  routeDirectionId: 1,
  durationDays: 7,
  isActive: true,
  limit: 10,
});

const response = await fetch(`/route-directions/templates?${params}`);
const result = await response.json();
```

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "routeDirectionId": 1,
      "durationDays": 7,
      "nameCN": "经典7日游",
      "nameEN": "Classic 7-Day Tour",
      "dayPlans": [
        {
          "day": 1,
          "theme": "适应日",
          "maxIntensity": "LIGHT",
          "maxElevationM": 3000
        }
      ],
      "defaultPacePreference": "BALANCED",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "routeDirection": {
        "id": 1,
        "nameCN": "南岛湖区+山口+徒步",
        "countryCode": "NZ"
      }
    }
  ],
  "error": null
}
```

---

### 2. 获取路线模板详情

根据 ID 获取路线模板的详细信息。

**接口**: `GET /route-directions/templates/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求示例**:

```typescript
const response = await fetch('/route-directions/templates/1', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
});

const result = await response.json();
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "routeDirectionId": 1,
    "durationDays": 7,
    "nameCN": "经典7日游",
    "nameEN": "Classic 7-Day Tour",
    "dayPlans": [
      {
        "day": 1,
        "theme": "适应日",
        "maxIntensity": "LIGHT",
        "maxElevationM": 3000,
        "requiredNodes": ["lodge_uuid_1"]
      },
      {
        "day": 2,
        "theme": "探索日",
        "maxIntensity": "MODERATE",
        "maxElevationM": 3500
      }
    ],
    "defaultPacePreference": "BALANCED",
    "metadata": {
      "difficulty": "moderate"
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "routeDirection": {
      "id": 1,
      "nameCN": "南岛湖区+山口+徒步",
      "countryCode": "NZ",
      "tags": ["徒步", "摄影"]
    }
  },
  "error": null
}
```

---

### 3. 创建路线模板

创建基于路线方向的行程模板。

**接口**: `POST /route-directions/templates`

**请求体**:

```typescript
interface CreateTemplateRequest {
  routeDirectionId: number;
  durationDays: number;
  name?: string;
  nameCN?: string;
  nameEN?: string;
  dayPlans: Array<{
    day: number;                    // 第几天（从1开始）
    theme?: string;                  // 主题
    maxIntensity?: string;           // 强度上限：LIGHT/MODERATE/INTENSE
    maxElevationM?: number;          // 最大海拔（米）
    requiredNodes?: string[];        // 必须节点（Place UUID 或名称）
    optionalActivities?: string[];  // 可选活动类型
  }>;
  defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
  metadata?: Record<string, any>;
  isActive?: boolean;
}
```

**请求示例**:

```typescript
const response = await fetch('/route-directions/templates', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    routeDirectionId: 1,
    durationDays: 7,
    nameCN: '经典7日游',
    nameEN: 'Classic 7-Day Tour',
    dayPlans: [
      {
        day: 1,
        theme: '适应日',
        maxIntensity: 'LIGHT',
        maxElevationM: 3000,
        requiredNodes: ['lodge_uuid_1']
      },
      {
        day: 2,
        theme: '探索日',
        maxIntensity: 'MODERATE',
        maxElevationM: 3500
      }
    ],
    defaultPacePreference: 'BALANCED',
    metadata: {
      difficulty: 'moderate',
      bestSeason: 'spring'
    },
    isActive: true
  }),
});

const result = await response.json();
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "routeDirectionId": 1,
    "durationDays": 7,
    "nameCN": "经典7日游",
    "dayPlans": [...],
    "defaultPacePreference": "BALANCED",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "error": null
}
```

---

### 4. 更新路线模板

更新路线模板信息。

**接口**: `PUT /route-directions/templates/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求体**: 所有字段均为可选，只更新提供的字段。

**请求示例**:

```typescript
const response = await fetch('/route-directions/templates/1', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    nameCN: '更新后的名称',
    defaultPacePreference: 'CHALLENGE',
    isActive: false
  }),
});

const result = await response.json();
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "nameCN": "更新后的名称",
    "defaultPacePreference": "CHALLENGE",
    "isActive": false,
    "updatedAt": "2024-01-02T00:00:00.000Z"
  },
  "error": null
}
```

---

### 5. 删除路线模板

软删除路线模板（设置 isActive = false）。

**接口**: `DELETE /route-directions/templates/:id`

**描述**: 软删除路线模板（设置 `isActive = false`），数据仍保留在数据库中

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求示例**:

```typescript
const response = await fetch('/route-directions/templates/1', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
  },
});

const result = await response.json();
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "message": "Route template deleted successfully"
  },
  "error": null
}
```

---

### 5.1 物理删除路线模板

**接口**: `DELETE /route-directions/templates/:id/hard`

**描述**: 物理删除路线模板，从数据库中彻底删除记录（不可恢复）。请谨慎使用此接口。

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求示例**:

```typescript
const response = await fetch('/route-directions/templates/1/hard', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
  },
});

const result = await response.json();
```

```javascript
// JavaScript
const response = await fetch('/route-directions/templates/1/hard', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
  },
});

const result = await response.json();
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "message": "Route template hard deleted successfully"
  },
  "error": null
}
```

**错误响应**:

- `404`: 路线模板不存在
- `500`: 服务器内部错误

**注意事项**:
- 物理删除操作不可恢复，请确保在删除前已备份重要数据
- 删除后，该路线模板的所有关联数据也将被删除（根据数据库外键约束）
- 建议在前端添加确认对话框，防止误操作

---

### 6. 使用模板创建行程 ⭐

从路线模板生成可执行行程（对应工作台的"使用模板"按钮）。

**接口**: `POST /route-directions/templates/:id/create-trip`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | number | 是 | 路线模板ID |

**请求体**:

```typescript
interface CreateTripFromTemplateRequest {
  destination: string;              // 国家代码，如 "IS", "JP"
  startDate: string;                // ISO 8601, 如 "2024-06-01"
  endDate: string;                  // ISO 8601, 如 "2024-06-07"
  totalBudget?: number;             // 可选，总预算（元）
  
  // 可选：用户偏好覆盖
  pacePreference?: 'RELAXED' | 'BALANCED' | 'CHALLENGE';  // 覆盖模板默认值
  intensity?: 'relaxed' | 'balanced' | 'intense';
  transport?: 'walk' | 'transit' | 'car';
  
  // 可选：约束条件
  travelers?: Array<{
    type: 'ADULT' | 'ELDERLY' | 'CHILD';
    mobilityTag: 'IRON_LEGS' | 'ACTIVE_SENIOR' | 'CITY_POTATO' | 'LIMITED';
  }>;
  
  constraints?: {
    withChildren?: boolean;
    withElderly?: boolean;
    earlyRiser?: boolean;
    dietaryRestrictions?: string[];
    avoidCategories?: string[];
  };
}
```

**请求示例**:

```typescript
const response = await fetch('/route-directions/templates/1/create-trip', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    destination: 'IS',
    startDate: '2024-06-01',
    endDate: '2024-06-07',
    totalBudget: 50000,
    pacePreference: 'BALANCED',
    intensity: 'balanced',
    transport: 'car',
    travelers: [
      {
        type: 'ADULT',
        mobilityTag: 'ACTIVE_SENIOR'
      }
    ],
    constraints: {
      withElderly: true,
      earlyRiser: false,
      dietaryRestrictions: ['vegetarian'],
      avoidCategories: ['nightlife']
    }
  }),
});

const result = await response.json();
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "trip": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "destination": "IS",
      "startDate": "2024-06-01T00:00:00.000Z",
      "endDate": "2024-06-07T00:00:00.000Z",
      "totalBudget": 50000,
      "status": "PLANNING",
      "pacingConfig": {
        "pacePreference": "BALANCED",
        "intensity": "balanced",
        "transport": "car"
      },
      "budgetConfig": {
        "totalBudget": 50000,
        "currency": "CNY"
      }
    },
    "generatedItems": [
      {
        "day": 1,
        "date": "2024-06-01",
        "items": [
          {
            "placeId": 123,
            "type": "ACTIVITY",
            "startTime": "2024-06-01T09:00:00.000Z",
            "endTime": "2024-06-01T12:00:00.000Z",
            "note": "根据模板主题\"冰川探索\"选择",
            "reason": "根据模板主题\"冰川探索\"选择"
          },
          {
            "placeId": 456,
            "type": "MEAL_ANCHOR",
            "startTime": "2024-06-01T12:00:00.000Z",
            "endTime": "2024-06-01T14:00:00.000Z",
            "note": "午餐推荐",
            "reason": "午餐推荐"
          }
        ]
      },
      {
        "day": 2,
        "date": "2024-06-02",
        "items": [...]
      }
    ],
    "stats": {
      "totalDays": 7,
      "totalItems": 25,
      "placesMatched": 23,
      "placesMissing": 2
    },
    "warnings": [
      "2 required places could not be matched"
    ]
  },
  "error": null
}
```

---

## 前端集成示例

### React + TypeScript 示例

```typescript
// api/routeTemplate.ts
interface RouteTemplate {
  id: number;
  routeDirectionId: number;
  durationDays: number;
  nameCN?: string;
  nameEN?: string;
  dayPlans: Array<{
    day: number;
    theme?: string;
    maxIntensity?: string;
    maxElevationM?: number;
  }>;
  defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
  isActive: boolean;
}

interface CreateTripFromTemplateRequest {
  destination: string;
  startDate: string;
  endDate: string;
  totalBudget?: number;
  pacePreference?: 'RELAXED' | 'BALANCED' | 'CHALLENGE';
  travelers?: Array<{
    type: 'ADULT' | 'ELDERLY' | 'CHILD';
    mobilityTag: 'IRON_LEGS' | 'ACTIVE_SENIOR' | 'CITY_POTATO' | 'LIMITED';
  }>;
}

class RouteTemplateAPI {
  private baseURL = '/route-directions/templates';

  // 查询模板列表
  async getTemplates(params?: {
    routeDirectionId?: number;
    durationDays?: number;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<RouteTemplate[]> {
    const queryParams = new URLSearchParams();
    if (params?.routeDirectionId) queryParams.append('routeDirectionId', params.routeDirectionId.toString());
    if (params?.durationDays) queryParams.append('durationDays', params.durationDays.toString());
    if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const response = await fetch(`${this.baseURL}?${queryParams}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch templates');
    }

    return result.data;
  }

  // 获取模板详情
  async getTemplate(id: number): Promise<RouteTemplate> {
    const response = await fetch(`${this.baseURL}/${id}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch template');
    }

    return result.data;
  }

  // 使用模板创建行程
  async createTripFromTemplate(
    templateId: number,
    request: CreateTripFromTemplateRequest
  ): Promise<{
    trip: {
      id: string;
      destination: string;
      startDate: string;
      endDate: string;
      totalBudget: number;
      status: string;
    };
    generatedItems: Array<{
      day: number;
      date: string;
      items: Array<{
        placeId: number;
        type: string;
        startTime: string;
        endTime: string;
        note?: string;
        reason?: string;
      }>;
    }>;
    stats: {
      totalDays: number;
      totalItems: number;
      placesMatched: number;
      placesMissing: number;
    };
    warnings?: string[];
  }> {
    const response = await fetch(`${this.baseURL}/${templateId}/create-trip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to create trip from template');
    }

    return result.data;
  }
}

export const routeTemplateAPI = new RouteTemplateAPI();
```

```typescript
// components/TemplateCard.tsx
import React from 'react';
import { routeTemplateAPI } from '../api/routeTemplate';

interface TemplateCardProps {
  template: {
    id: number;
    nameCN?: string;
    durationDays: number;
    defaultPacePreference?: string;
  };
  onUseTemplate: (templateId: number) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({ template, onUseTemplate }) => {
  const paceLabel = {
    RELAX: '轻松版',
    BALANCED: '平衡版',
    CHALLENGE: '挑战版',
  }[template.defaultPacePreference || 'BALANCED'] || '平衡版';

  return (
    <div className="template-card">
      <h3>{template.nameCN || `模板 ${template.id}`}</h3>
      <p>{template.durationDays} 天 · {paceLabel}</p>
      <button onClick={() => onUseTemplate(template.id)}>
        使用模板
      </button>
    </div>
  );
};
```

```typescript
// components/CreateTripFromTemplateDialog.tsx
import React, { useState } from 'react';
import { routeTemplateAPI } from '../api/routeTemplate';

interface CreateTripFromTemplateDialogProps {
  templateId: number;
  onSuccess: (tripId: string) => void;
  onCancel: () => void;
}

export const CreateTripFromTemplateDialog: React.FC<CreateTripFromTemplateDialogProps> = ({
  templateId,
  onSuccess,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    destination: '',
    startDate: '',
    endDate: '',
    totalBudget: 0,
    pacePreference: 'BALANCED' as const,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await routeTemplateAPI.createTripFromTemplate(templateId, formData);
      onSuccess(result.trip.id);
    } catch (err: any) {
      setError(err.message || '创建行程失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <h2>使用模板创建行程</h2>
        <form onSubmit={handleSubmit}>
          <div>
            <label>目的地国家代码</label>
            <input
              type="text"
              value={formData.destination}
              onChange={(e) => setFormData({ ...formData, destination: e.target.value.toUpperCase() })}
              placeholder="如: IS, JP"
              required
            />
          </div>
          <div>
            <label>开始日期</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
            />
          </div>
          <div>
            <label>结束日期</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              required
            />
          </div>
          <div>
            <label>总预算（元）</label>
            <input
              type="number"
              value={formData.totalBudget}
              onChange={(e) => setFormData({ ...formData, totalBudget: Number(e.target.value) })}
              min="0"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="dialog-actions">
            <button type="button" onClick={onCancel}>取消</button>
            <button type="submit" disabled={loading}>
              {loading ? '创建中...' : '创建行程'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

```typescript
// pages/TemplateListPage.tsx
import React, { useEffect, useState } from 'react';
import { routeTemplateAPI } from '../api/routeTemplate';
import { TemplateCard } from '../components/TemplateCard';
import { CreateTripFromTemplateDialog } from '../components/CreateTripFromTemplateDialog';
import { useNavigate } from 'react-router-dom';

export const TemplateListPage: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await routeTemplateAPI.getTemplates({ isActive: true, limit: 20 });
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = (templateId: number) => {
    setSelectedTemplateId(templateId);
  };

  const handleCreateSuccess = (tripId: string) => {
    setSelectedTemplateId(null);
    navigate(`/dashboard/trips/${tripId}`);
  };

  if (loading) {
    return <div>加载中...</div>;
  }

  return (
    <div className="template-list-page">
      <h1>路线模板</h1>
      <div className="template-grid">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onUseTemplate={handleUseTemplate}
          />
        ))}
      </div>

      {selectedTemplateId && (
        <CreateTripFromTemplateDialog
          templateId={selectedTemplateId}
          onSuccess={handleCreateSuccess}
          onCancel={() => setSelectedTemplateId(null)}
        />
      )}
    </div>
  );
};
```

---

## 错误处理

### 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| NOT_FOUND | 404 | 资源不存在 |
| VALIDATION_ERROR | 400 | 请求参数验证失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |
| TEMPLATE_NOT_FOUND | 404 | 路线模板不存在 |
| INSUFFICIENT_PLACES | 400 | 目的地地点数据不足 |
| VALIDATION_FAILED | 400 | 数据验证失败 |
| LLM_ERROR | 500 | LLM 编排失败 |

### 错误处理示例

```typescript
try {
  const result = await routeTemplateAPI.createTripFromTemplate(templateId, request);
  // 处理成功
} catch (error: any) {
  if (error.message.includes('NOT_FOUND')) {
    // 模板不存在
    showError('模板不存在，请选择其他模板');
  } else if (error.message.includes('INSUFFICIENT_PLACES')) {
    // 地点数据不足
    showError('该目的地地点数据不足，无法生成行程');
  } else {
    // 其他错误
    showError('创建行程失败，请稍后重试');
  }
}
```

---

## 数据类型定义

### TypeScript 类型定义

```typescript
// 路线模板
interface RouteTemplate {
  id: number;
  uuid: string;
  routeDirectionId: number;
  durationDays: number;
  name?: string;
  nameCN?: string;
  nameEN?: string;
  dayPlans: DayPlan[];
  defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
  metadata?: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  routeDirection?: {
    id: number;
    nameCN: string;
    countryCode: string;
    tags?: string[];
  };
}

// 每日计划
interface DayPlan {
  day: number;                      // 第几天（从1开始）
  theme?: string;                   // 主题
  maxIntensity?: string;            // 强度上限：LIGHT/MODERATE/INTENSE
  maxElevationM?: number;           // 最大海拔（米）
  requiredNodes?: string[];         // 必须节点（Place UUID 或名称）
  optionalActivities?: string[];    // 可选活动类型
  [key: string]: any;               // 允许其他扩展字段
}

// 创建行程请求
interface CreateTripFromTemplateRequest {
  destination: string;
  startDate: string;
  endDate: string;
  totalBudget?: number;
  pacePreference?: 'RELAXED' | 'BALANCED' | 'CHALLENGE';
  intensity?: 'relaxed' | 'balanced' | 'intense';
  transport?: 'walk' | 'transit' | 'car';
  travelers?: Traveler[];
  constraints?: Constraints;
}

// 旅行者
interface Traveler {
  type: 'ADULT' | 'ELDERLY' | 'CHILD';
  mobilityTag: 'IRON_LEGS' | 'ACTIVE_SENIOR' | 'CITY_POTATO' | 'LIMITED';
}

// 约束条件
interface Constraints {
  withChildren?: boolean;
  withElderly?: boolean;
  earlyRiser?: boolean;
  dietaryRestrictions?: string[];
  avoidCategories?: string[];
}

// 创建行程响应
interface CreateTripFromTemplateResponse {
  trip: {
    id: string;
    destination: string;
    startDate: string;
    endDate: string;
    totalBudget: number;
    status: string;
    pacingConfig?: any;
    budgetConfig?: any;
  };
  generatedItems: Array<{
    day: number;
    date: string;
    items: Array<{
      placeId: number;
      type: string;
      startTime: string;
      endTime: string;
      note?: string;
      reason?: string;
    }>;
  }>;
  stats: {
    totalDays: number;
    totalItems: number;
    placesMatched: number;
    placesMissing: number;
  };
  warnings?: string[];
}
```

---

## 最佳实践

### 1. 加载状态管理

```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleCreate = async () => {
  setLoading(true);
  setError(null);
  try {
    await routeTemplateAPI.createTripFromTemplate(templateId, request);
  } catch (err: any) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

### 2. 表单验证

```typescript
const validateForm = (data: CreateTripFromTemplateRequest): string | null => {
  if (!data.destination || data.destination.length !== 2) {
    return '目的地必须是2位国家代码';
  }
  if (!data.startDate || !data.endDate) {
    return '请选择开始和结束日期';
  }
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  if (end <= start) {
    return '结束日期必须晚于开始日期';
  }
  return null;
};
```

### 3. 错误提示

```typescript
const showError = (message: string) => {
  // 使用你的 UI 库显示错误提示
  // 例如: toast.error(message);
  console.error(message);
};
```

### 4. 成功处理

```typescript
const handleCreateSuccess = (result: CreateTripFromTemplateResponse) => {
  // 显示成功提示
  showSuccess('行程创建成功！');
  
  // 如果有警告，显示警告
  if (result.warnings && result.warnings.length > 0) {
    result.warnings.forEach(warning => {
      showWarning(warning);
    });
  }
  
  // 跳转到行程详情页
  navigate(`/dashboard/trips/${result.trip.id}`);
};
```

---

## 常见问题

### Q: 如何获取特定路线方向的所有模板？

A: 使用查询接口，传入 `routeDirectionId` 参数：

```typescript
const templates = await routeTemplateAPI.getTemplates({
  routeDirectionId: 1,
  isActive: true
});
```

### Q: 创建行程后如何获取完整的行程数据？

A: 创建成功后返回的 `trip.id` 可以用于调用行程详情接口：

```typescript
const result = await routeTemplateAPI.createTripFromTemplate(templateId, request);
const tripId = result.trip.id;
// 然后调用行程详情接口获取完整数据
const trip = await tripAPI.getTrip(tripId);
```

### Q: 如何处理地点匹配失败的情况？

A: 响应中的 `stats.placesMissing` 和 `warnings` 字段会提示匹配失败的情况。前端应该：

1. 检查 `warnings` 数组，如果有警告则显示给用户
2. 如果 `placesMissing > 0`，提示用户部分地点无法匹配
3. 允许用户手动编辑生成的行程

### Q: 日期格式要求是什么？

A: 使用 ISO 8601 格式，例如：`"2024-06-01"` 或 `"2024-06-01T00:00:00.000Z"`

---

## 更新日志

- **2024-01-02**: 初始版本，包含所有路线模板相关接口的前端对接文档

