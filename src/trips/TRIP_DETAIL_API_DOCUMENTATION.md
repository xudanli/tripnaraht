# 行程详情页 API 接口文档

**版本**: 1.0  
**日期**: 2026-02-05  
**状态**: 当前实现

---

## 📋 概述

本文档列出了行程详情页相关的所有后端 API 接口。行程详情页是"理解与掌控旅行现状"的核心页面，提供行程健康度分析、状态理解、决策解释等功能。

---

## 🎯 基础路径

```
/api/trips          # 行程基础接口
/api/trip-detail    # 行程详情页 Agent 接口
```

---

## 📚 接口列表

### 1. 获取单个行程详情（全景视图）

**端点**: `GET /api/trips/:id`  
**说明**: 根据行程 ID 获取完整的行程树形结构，包括所有 TripDay、ItineraryItem 和关联的 Place 详情

#### 路径参数

- `id` (string, 必需): 行程 ID (UUID)  
  示例: `f3626ff1-7a9b-46d9-8b8b-7f53a14583b1`

#### 响应格式

```typescript
{
  success: true,
  data: {
    id: string;
    name: string;
    destination: string;
    startDate: string; // ISO 8601
    endDate: string; // ISO 8601
    status: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    budgetConfig?: any;
    pacingConfig?: any;
    TripDay: Array<{
      id: string;
      date: string; // ISO 8601 date
      ItineraryItem: Array<{
        id: string;
        placeId?: number;
        Place?: {
          id: number;
          nameCN: string;
          nameEN?: string;
          coordinates?: { lat: number; lng: number };
          address?: string;
          openingHours?: any;
        };
        startTime: string; // HH:mm
        endTime: string; // HH:mm
        notes?: string;
      }>;
    }>;
    // 统计信息
    totalDays: number;
    totalItems: number;
  }
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "name": "冰岛环岛之旅",
    "destination": "冰岛",
    "startDate": "2025-06-01",
    "endDate": "2025-06-10",
    "status": "PLANNING",
    "TripDay": [
      {
        "id": "day-1",
        "date": "2025-06-01",
        "ItineraryItem": [
          {
            "id": "item-1",
            "placeId": 123,
            "Place": {
              "id": 123,
              "nameCN": "蓝湖",
              "nameEN": "Blue Lagoon",
              "coordinates": { "lat": 63.8804, "lng": -22.4495 }
            },
            "startTime": "10:00",
            "endTime": "12:00"
          }
        ]
      }
    ],
    "totalDays": 10,
    "totalItems": 45
  }
}
```

---

### 2. 获取行程洞察摘要

**端点**: `GET /api/trips/:id/insight`  
**说明**: 获取行程的 AI 洞察摘要，包括行程基本信息、AI 发现的问题/建议、准备度摘要和整体状态。用于前端展示行程健康度和优化建议。

#### 路径参数

- `id` (string, 必需): 行程 ID (UUID)

#### 响应格式

```typescript
{
  success: true,
  data: {
    tripSummary: {
      destination: string;
      days: number;
      placesCount: number;
      startDate: string;
      endDate: string;
    };
    findings: Array<{
      type: 'warning' | 'suggestion' | 'positive';
      icon: string;
      title: string;
      message: string;
      actionLabel?: string | null;
      actionPrompt?: string | null;
    }>;
    readiness: {
      status: 'pass' | 'warn' | 'block';
      blockers: number;
      must: number; // 必须项数量
      should: number; // 建议项数量
    };
    overallStatus: 'good' | 'needs_attention' | 'has_issues';
  }
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "tripSummary": {
      "destination": "冰岛",
      "days": 10,
      "placesCount": 45,
      "startDate": "2025-06-01",
      "endDate": "2025-06-10"
    },
    "findings": [
      {
        "type": "warning",
        "icon": "clock",
        "title": "Day 2 安排较紧凑",
        "message": "第二天安排了 6 个景点，可能需要更多休息时间",
        "actionLabel": "优化 Day 2",
        "actionPrompt": "帮我优化第二天的行程，适当减少景点或调整顺序"
      }
    ],
    "readiness": {
      "status": "warn",
      "blockers": 0,
      "must": 2,
      "should": 5
    },
    "overallStatus": "needs_attention"
  }
}
```

---

### 3. 执行行程详情页流程（Agent 接口）

**端点**: `POST /api/trip-detail/execute`  
**说明**: 行程详情页的 Agent，负责"理解与掌控旅行现状"。支持多种操作类型。

#### 请求体

```typescript
{
  tripId: string; // 必需
  action: 'get_status' | 'get_health' | 'explain_decisions' | 'show_evidence' | 'get_full'; // 必需
  decisionId?: string; // explain_decisions 时使用
  evidenceRefs?: string[]; // show_evidence 时使用
}
```

#### 操作类型说明

- `get_status`: 理解当前状态
- `get_health`: 分析健康度
- `explain_decisions`: 解释决策
- `show_evidence`: 展示证据
- `get_full`: 获取完整信息

#### 响应格式

```typescript
{
  success: true,
  data: {
    detailState: {
      tripId: string;
      health: {
        overall: 'healthy' | 'warning' | 'critical';
        dimensions: {
          schedule: { status: string; score: number; issues: string[] };
          budget: { status: string; score: number; issues: string[] };
          pace: { status: string; score: number; issues: string[] };
          feasibility: { status: string; score: number; issues: string[] };
        };
      };
      statusUnderstanding: {
        currentPhase: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
        progress: { completed: number; total: number; percentage: number };
        nextSteps: Array<{ step: string; priority: string; deadline?: string }>;
        risks: Array<{ type: string; severity: string; description: string; mitigation?: string }>;
        opportunities: Array<{ type: string; description: string; benefit: string }>;
      };
      decisionExplanations: Array<{
        decisionId: string;
        decisionType: string;
        explanation: string;
        evidence: Array<{ source: string; excerpt: string; relevance: string }>;
        persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        timestamp: string;
      }>;
      evidence: Array<{
        id: string;
        source: string;
        excerpt: string;
        relevance: string;
        confidence: 'low' | 'medium' | 'high';
      }>;
      lastUpdated: string;
    };
    uiOutput: {
      status?: TripStatusUnderstanding;
      health?: TripHealth;
      explanations?: DecisionExplanation[];
      evidence?: Array<{
        id: string;
        source: string;
        excerpt: string;
        relevance: string;
        confidence: 'low' | 'medium' | 'high';
      }>;
    };
  }
}
```

#### 请求示例

```json
{
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
  "action": "get_health"
}
```

---

### 4. 获取行程状态（GET 方式）

**端点**: `GET /api/trip-detail/:tripId/status`  
**说明**: 理解当前行程状态（规划中/进行中/已完成）

#### 路径参数

- `tripId` (string, 必需): 行程 ID

#### 响应格式

```typescript
{
  success: true,
  data: {
    currentPhase: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    progress: {
      completed: number;
      total: number;
      percentage: number;
    };
    nextSteps: Array<{
      step: string;
      priority: 'high' | 'medium' | 'low';
      deadline?: string;
    }>;
    risks: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      mitigation?: string;
    }>;
    opportunities: Array<{
      type: string;
      description: string;
      benefit: string;
    }>;
  }
}
```

---

### 5. 获取行程健康度（GET 方式）

**端点**: `GET /api/trip-detail/:tripId/health`  
**说明**: 分析行程健康度（时间、预算、节奏、可达性）

#### 路径参数

- `tripId` (string, 必需): 行程 ID

#### 响应格式

```typescript
{
  success: true,
  data: {
    overall: 'healthy' | 'warning' | 'critical';
    dimensions: {
      schedule: {
        status: 'healthy' | 'warning' | 'critical';
        score: number; // 0-100
        issues: string[];
      };
      budget: {
        status: 'healthy' | 'warning' | 'critical';
        score: number; // 0-100
        issues: string[];
      };
      pace: {
        status: 'healthy' | 'warning' | 'critical';
        score: number; // 0-100
        issues: string[];
      };
      feasibility: {
        status: 'healthy' | 'warning' | 'critical';
        score: number; // 0-100
        issues: string[];
      };
    };
  }
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "overall": "warning",
    "dimensions": {
      "schedule": {
        "status": "warning",
        "score": 75,
        "issues": ["Day 2 时间安排较紧凑"]
      },
      "budget": {
        "status": "healthy",
        "score": 90,
        "issues": []
      },
      "pace": {
        "status": "healthy",
        "score": 85,
        "issues": []
      },
      "feasibility": {
        "status": "healthy",
        "score": 88,
        "issues": []
      }
    }
  }
}
```

---

### 6. Auto综合：批量应用高优先级建议

**端点**: `POST /api/planning-workbench/auto-optimize`  
**说明**: 自动批量应用所有高优先级建议（severity === BLOCKER）。只应用高优先级建议，确保安全性。

#### 请求体

```typescript
{
  tripId: string;        // 必需：行程 ID
  preview?: boolean;     // 可选：是否预览模式（不实际应用），默认 false
  limit?: number;        // 可选：最多应用的建议数量，默认 10
}
```

#### 请求示例

```json
{
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
  "preview": false,
  "limit": 10
}
```

#### 响应格式

```typescript
{
  success: true,
  data: {
    success: boolean;              // 是否至少成功应用一个建议
    appliedCount: number;          // 成功应用的建议数量
    suggestions: Array<{
      id: string;                   // 建议 ID
      title: string;                // 建议标题
      severity: 'blocker' | 'warn' | 'info';  // 严重级别
      applied: boolean;             // 是否成功应用
      error?: string;               // 如果应用失败，错误信息
    }>;
    impact?: {
      metrics: {
        fatigue?: number;          // 疲劳指数变化
        buffer?: number;            // 缓冲时间变化（分钟）
        cost?: number;              // 费用变化
      };
      risks?: Array<{
        id: string;
        severity: string;
        title: string;
      }>;
    };
  }
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "success": true,
    "appliedCount": 3,
    "suggestions": [
      {
        "id": "suggestion-1",
        "title": "Day 2 时间安排较紧凑",
        "severity": "blocker",
        "applied": true
      },
      {
        "id": "suggestion-2",
        "title": "预算超支 15%",
        "severity": "blocker",
        "applied": true
      },
      {
        "id": "suggestion-3",
        "title": "Day 3 缺少缓冲时间",
        "severity": "blocker",
        "applied": false,
        "error": "没有可执行的操作"
      }
    ],
    "impact": {
      "metrics": {
        "fatigue": -15,
        "buffer": 90,
        "cost": 150
      },
      "risks": []
    }
  }
}
```

#### 优先级说明

Auto综合功能只应用高优先级建议：
- **BLOCKER** = 高优先级（会被应用）
- **WARN** = 中优先级（不会被应用）
- **INFO** = 低优先级（不会被应用）

#### 使用场景

1. **预览模式**：查看将要应用的建议，不实际修改行程
   ```json
   {
     "tripId": "xxx",
     "preview": true
   }
   ```

2. **实际应用**：批量应用高优先级建议
   ```json
   {
     "tripId": "xxx",
     "preview": false,
     "limit": 10
   }
   ```

#### 错误处理

- **400 Bad Request**: 请求参数错误
- **404 Not Found**: 行程不存在
- **500 Internal Server Error**: 服务器内部错误

---

### 7. 获取健康度指标的详细解释

**端点**: `GET /api/trip-detail/:tripId/metrics/:dimension/explanation`  
**说明**: 获取指定健康度维度（schedule/budget/pace/feasibility）的详细解释，包括计算方法、理想范围、改进建议等

#### 路径参数

- `tripId` (string, 必需): 行程 ID (UUID)
- `dimension` (string, 必需): 健康度维度
  - 可选值: `schedule` | `budget` | `pace` | `feasibility`
  - 示例: `pace`

#### 响应格式

```typescript
{
  success: true,
  data: {
    dimension: string;              // 维度标识
    dimensionName: string;          // 维度名称（中文）
    description: string;            // 维度描述
    currentScore: number;           // 当前分数（0-100）
    currentStatus: 'healthy' | 'warning' | 'critical';
    overallStatus: 'healthy' | 'warning' | 'critical';
    calculationMethod: string;     // 计算方法说明
    idealRange: string;            // 理想范围说明
    issues: string[];              // 当前问题列表
    suggestions: string[];         // 改进建议
    impact: 'low' | 'medium' | 'high';
    lastUpdated: string;           // 最后更新时间
  }
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "dimension": "pace",
    "dimensionName": "节奏",
    "description": "评估行程节奏是否合适，包括疲劳度、活动密度等",
    "currentScore": 75,
    "currentStatus": "warning",
    "overallStatus": "warning",
    "calculationMethod": "基础分100分，疲劳分>85扣40分，>70扣20分",
    "idealRange": "70-100分（健康），50-69分（警告），0-49分（严重）",
    "issues": [
      "疲劳评分略高: 72/100"
    ],
    "suggestions": [
      "增加休息时间",
      "减少高强度活动",
      "调整活动顺序"
    ],
    "impact": "medium",
    "lastUpdated": "2026-02-05T13:00:00.000Z"
  }
}
```

#### 使用示例

```bash
# 获取节奏维度的解释
curl "http://localhost:3000/api/trip-detail/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1/metrics/pace/explanation"

# 获取预算维度的解释
curl "http://localhost:3000/api/trip-detail/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1/metrics/budget/explanation"
```

---

## 🔗 相关接口

### 更新行程基本信息

**端点**: `PUT /api/trips/:id`  
**说明**: 更新行程的基本信息，包括目的地、日期、预算、旅行者、状态等

### 获取行程当前状态

**端点**: `GET /api/trips/:id/state`  
**说明**: 返回行程的当前状态，包括当前日期、当前行程项、下一站信息等

### 获取决策记录

**端点**: `GET /api/trips/:id/decision-log`  
**说明**: 获取行程的决策记录，用于透明日志展示

### 获取证据列表

**端点**: `GET /api/trips/:id/evidence`  
**说明**: 获取指定行程的所有证据项列表

### 获取三人格提醒

**端点**: `GET /api/trips/:id/persona-alerts`  
**说明**: 获取当前行程的三人格（Abu、Dr.Dre、Neptune）提醒列表

---

## 📝 数据类型定义

### TripHealth

```typescript
interface TripHealth {
  overall: 'healthy' | 'warning' | 'critical';
  dimensions: {
    schedule: { status: string; score: number; issues: string[] };
    budget: { status: string; score: number; issues: string[] };
    pace: { status: string; score: number; issues: string[] };
    feasibility: { status: string; score: number; issues: string[] };
  };
}
```

### TripStatusUnderstanding

```typescript
interface TripStatusUnderstanding {
  currentPhase: 'PLANNING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  nextSteps: Array<{
    step: string;
    priority: 'high' | 'medium' | 'low';
    deadline?: string;
  }>;
  risks: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigation?: string;
  }>;
  opportunities: Array<{
    type: string;
    description: string;
    benefit: string;
  }>;
}
```

### DecisionExplanation

```typescript
interface DecisionExplanation {
  decisionId: string;
  decisionType: string;
  explanation: string;
  evidence: Array<{
    source: string;
    excerpt: string;
    relevance: string;
  }>;
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
  timestamp: string;
}
```

---

## 🔐 认证

所有接口默认需要用户认证（Bearer Token），除非标记为 `@Public()`。

当前以下接口为公开接口（用于测试）：
- `/api/trip-detail/execute`
- `/api/trip-detail/:tripId/status`
- `/api/trip-detail/:tripId/health`

**注意**: 生产环境应移除 `@Public()` 装饰器。

---

## 📊 响应格式

所有接口遵循统一的响应格式：

### 成功响应

```typescript
{
  success: true,
  data: T // 具体数据类型
}
```

### 错误响应

```typescript
{
  success: false,
  error: {
    code: string; // 错误代码
    message: string; // 错误消息
  }
}
```

### 常见错误代码

- `NOT_FOUND`: 资源不存在
- `INTERNAL_ERROR`: 服务器内部错误
- `BAD_REQUEST`: 请求参数错误
- `UNAUTHORIZED`: 未授权

---

## 🚀 使用示例

### 获取行程详情和健康度

```typescript
// 1. 获取行程详情
const tripResponse = await fetch('/api/trips/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1', {
  headers: { 'Authorization': 'Bearer <token>' }
});
const trip = await tripResponse.json();

// 2. 获取行程洞察
const insightResponse = await fetch('/api/trips/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1/insight', {
  headers: { 'Authorization': 'Bearer <token>' }
});
const insight = await insightResponse.json();

// 3. 获取健康度
const healthResponse = await fetch('/api/trip-detail/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1/health', {
  headers: { 'Authorization': 'Bearer <token>' }
});
const health = await healthResponse.json();
```

### 执行 Agent 操作

```typescript
// 获取完整信息
const response = await fetch('/api/trip-detail/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <token>'
  },
  body: JSON.stringify({
    tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
    action: 'get_full'
  })
});
const result = await response.json();
```

---

## 📚 相关文档

- [产品决策文档](../.claude/product-decisions/trip-detail-page-redesign.md)
- [Trip Detail Agent Prompt](../../prompts/agents/TripDetail.md)
- [决策 API 文档](../decision-draft/DECISION_API_FRONTEND_GUIDE.md)
- [规划工作台 API 文档](../agent/PLANNING_WORKBENCH_API.md)

---

**文档状态**: ✅ 当前版本  
**最后更新**: 2026-02-05
