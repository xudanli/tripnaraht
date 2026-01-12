# 执行阶段和行程详情页 Agent API 文档

## 概述

本文档描述执行阶段和行程详情页的 Agent API 接口。

- **执行阶段 Agent**: "贴心管家式的提醒、变更与兜底"
- **行程详情页 Agent**: "理解与掌控旅行现状的地方"

---

## 执行阶段 Agent API

### Base URL
`/api/execution`

### 1. 执行执行阶段流程

**接口**: `POST /api/execution/execute`

**描述**: 执行阶段的 Agent，负责"贴心管家式的提醒、变更与兜底"。

**请求参数**:

```typescript
{
  tripId: string;                    // 行程 ID（必填）
  action: 'remind' | 'handle_change' | 'fallback' | 'get_status';  // 操作类型（必填）
  
  // 提醒相关参数（action === 'remind' 时）
  remindParams?: {
    reminderTypes?: string[];        // 提醒类型列表
    advanceHours?: number;           // 提前时间（小时，默认 24）
  };
  
  // 变更相关参数（action === 'handle_change' 时）
  changeParams?: {
    changeType: 'schedule_change' | 'location_change' | 'activity_cancelled' | 
                'transport_delay' | 'weather_impact' | 'budget_overrun' | 'user_request';
    changeDetails: {
      itemId?: string;
      originalValue?: any;
      newValue?: any;
      reason?: string;
    };
  };
  
  // 兜底相关参数（action === 'fallback' 时）
  fallbackParams?: {
    triggerReason: string;           // 触发原因
    originalPlan: any;               // 原计划
  };
}
```

**请求示例**:

```json
{
  "tripId": "trip-123",
  "action": "remind",
  "remindParams": {
    "reminderTypes": ["departure", "transport", "weather"],
    "advanceHours": 24
  }
}
```

**响应结构**:

```typescript
{
  success: boolean;
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
      pendingChanges: any[];
      activeFallbacks: any[];
      lastUpdated: string;
    };
    uiOutput: {
      reminders?: any[];
      changeResult?: any;
      fallbackPlan?: any;
      status?: {
        currentDay: number;
        currentDate: string;
        phase: string;
        activeIssues: number;
      };
    };
  };
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "executionState": {
      "tripId": "trip-123",
      "phase": "ON_TRIP",
      "currentDay": 1,
      "currentDate": "2024-01-15",
      "reminders": [
        {
          "id": "reminder_1234567890_departure",
          "type": "departure",
          "title": "出发提醒",
          "message": "您的行程即将开始，请确认已准备好所有必需品。",
          "triggerTime": "2024-01-16T10:00:00.000Z",
          "priority": "high"
        }
      ],
      "pendingChanges": [],
      "activeFallbacks": [],
      "lastUpdated": "2024-01-15T10:30:00.000Z"
    },
    "uiOutput": {
      "reminders": [...]
    }
  }
}
```

---

## 行程详情页 Agent API

### Base URL
`/api/trip-detail`

### 1. 执行行程详情页流程

**接口**: `POST /api/trip-detail/execute`

**描述**: 行程详情页的 Agent，负责"理解与掌控旅行现状"。

**请求参数**:

```typescript
{
  tripId: string;                    // 行程 ID（必填）
  action: 'get_status' | 'get_health' | 'explain_decisions' | 
          'show_evidence' | 'get_full';  // 操作类型（必填）
  
  decisionId?: string;               // 决策 ID（explain_decisions 时使用）
  evidenceRefs?: string[];           // 证据引用（show_evidence 时使用）
}
```

**请求示例**:

```json
{
  "tripId": "trip-123",
  "action": "get_full"
}
```

**响应结构**:

```typescript
{
  success: boolean;
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
        risks: Array<{ type: string; severity: string; description: string }>;
        opportunities: Array<{ type: string; description: string; benefit: string }>;
      };
      decisionExplanations: Array<{
        decisionId: string;
        decisionType: string;
        explanation: string;
        evidence: any[];
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
      status?: any;
      health?: any;
      explanations?: any[];
      evidence?: any[];
    };
  };
}
```

### 2. 获取行程状态（GET 方式）

**接口**: `GET /api/trip-detail/:tripId/status`

**描述**: 理解当前行程状态（规划中/进行中/已完成）。

**路径参数**:
- `tripId` (string): 行程 ID

**响应**: 返回 `statusUnderstanding` 对象

### 3. 获取行程健康度（GET 方式）

**接口**: `GET /api/trip-detail/:tripId/health`

**描述**: 分析行程健康度（时间、预算、节奏、可达性）。

**路径参数**:
- `tripId` (string): 行程 ID

**响应**: 返回 `health` 对象

---

## 前端集成示例

### 执行阶段 - 生成提醒

```typescript
const response = await fetch('/api/execution/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripId: 'trip-123',
    action: 'remind',
    remindParams: {
      reminderTypes: ['departure', 'transport', 'weather'],
      advanceHours: 24,
    },
  }),
});

const result = await response.json();
if (result.success) {
  const reminders = result.data.uiOutput.reminders;
  // 显示提醒列表
}
```

### 执行阶段 - 处理变更

```typescript
const response = await fetch('/api/execution/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripId: 'trip-123',
    action: 'handle_change',
    changeParams: {
      changeType: 'schedule_change',
      changeDetails: {
        itemId: 'item-456',
        originalValue: { startTime: '09:00' },
        newValue: { startTime: '10:00' },
        reason: '用户请求调整时间',
      },
    },
  }),
});

const result = await response.json();
if (result.success) {
  const changeResult = result.data.uiOutput.changeResult;
  // 显示变更处理结果
}
```

### 行程详情页 - 获取完整信息

```typescript
const response = await fetch('/api/trip-detail/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripId: 'trip-123',
    action: 'get_full',
  }),
});

const result = await response.json();
if (result.success) {
  const { health, status, explanations, evidence } = result.data.uiOutput;
  // 显示健康度、状态、决策解释、证据
}
```

### 行程详情页 - 获取健康度（GET）

```typescript
const response = await fetch('/api/trip-detail/trip-123/health');
const result = await response.json();
if (result.success) {
  const health = result.data;
  // 显示健康度雷达图
}
```

---

## 改动说明

### 新增文件

1. **执行阶段技能** (3个)
   - `src/skills/exec/exec-remind.skill.ts` - 生成提醒
   - `src/skills/exec/exec-handle-change.skill.ts` - 处理变更
   - `src/skills/exec/exec-fallback.skill.ts` - 生成兜底方案

2. **行程详情页技能** (4个)
   - `src/skills/detail/detail-understand-status.skill.ts` - 理解状态
   - `src/skills/detail/detail-analyze-health.skill.ts` - 分析健康度
   - `src/skills/detail/detail-explain-decision.skill.ts` - 解释决策
   - `src/skills/detail/detail-show-evidence.skill.ts` - 展示证据

3. **Agent 服务**
   - `src/agent/services/execution-agent.service.ts` - 执行阶段 Agent
   - `src/agent/services/trip-detail-agent.service.ts` - 行程详情页 Agent

4. **API Controller**
   - `src/agent/execution.controller.ts` - 执行阶段 API
   - `src/agent/trip-detail.controller.ts` - 行程详情页 API

5. **数据结构**
   - `src/skills/exec/shared/execution-state.types.ts` - 执行状态类型
   - `src/skills/detail/shared/detail-state.types.ts` - 详情状态类型

### 修改文件

1. **`src/skills/skills.module.ts`**
   - 注册所有执行阶段技能（3个）
   - 注册所有行程详情页技能（4个）

2. **`src/agent/agent.module.ts`**
   - 注册 `ExecutionController` 和 `TripDetailController`
   - 注册 `ExecutionAgentService` 和 `TripDetailAgentService`

### 接口变更

**新增接口**:
- `POST /api/execution/execute` - 执行执行阶段流程
- `POST /api/trip-detail/execute` - 执行行程详情页流程
- `GET /api/trip-detail/:tripId/status` - 获取行程状态
- `GET /api/trip-detail/:tripId/health` - 获取行程健康度

**无破坏性变更**: 所有新接口都是新增的，不影响现有接口。

---

## 总结

✅ **已完成**:
- 执行阶段 Agent（3个技能 + Agent 服务 + API）
- 行程详情页 Agent（4个技能 + Agent 服务 + API）
- 所有技能已注册
- 所有服务已注册
- API 接口已暴露

📝 **文档**:
- 本文档：`EXECUTION_AND_DETAIL_AGENTS_API.md`
- 规划工作台文档：`PLANNING_WORKBENCH_API_DOCUMENTATION.md`
