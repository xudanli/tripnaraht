# Agent Module

Module 14: Semantic Router + Orchestrator

## 概述

Agent 模块实现了双系统架构（System 1 / System 2），提供智能路由和执行能力。

### System 1（快）
- `SYSTEM1_API`: 标准 API / CRUD / 简单查询
- `SYSTEM1_RAG`: 知识库/向量检索

### System 2（慢）
- `SYSTEM2_REASONING`: ReAct + 工具 + TravelPlanner/Critic
- `SYSTEM2_WEBBROWSE`: 无头浏览器兜底（仅授权后）

## API

### POST /agent/route_and_run

统一入口，自动路由并执行。

**Request:**
```json
{
  "request_id": "uuid",
  "user_id": "string",
  "trip_id": "string|null",
  "message": "用户输入的自然语言",
  "conversation_context": {
    "recent_messages": ["string"],
    "locale": "zh-CN",
    "timezone": "Asia/Shanghai"
  },
  "options": {
    "dry_run": false,
    "allow_webbrowse": false,
    "max_seconds": 60,
    "max_steps": 8,
    "max_browser_steps": 12,
    "cost_budget_usd": 0.20
  }
}
```

**Response:**
```json
{
  "request_id": "uuid",
  "route": {
    "route": "SYSTEM1_API|SYSTEM1_RAG|SYSTEM2_REASONING|SYSTEM2_WEBBROWSE",
    "confidence": 0.85,
    "reasons": ["MULTI_CONSTRAINT"],
    "required_capabilities": ["places", "transport"],
    "consent_required": false,
    "budget": { "max_seconds": 60, "max_steps": 8, "max_browser_steps": 0 },
    "ui_hint": {
      "mode": "fast|slow",
      "status": "thinking|browsing|verifying|repairing|awaiting_consent|awaiting_confirmation",
      "message": "..."
    }
  },
  "result": {
    "status": "OK|NEED_MORE_INFO|NEED_CONSENT|NEED_CONFIRMATION|FAILED|TIMEOUT",
    "answer_text": "处理结果的自然语言描述",
    "payload": {
      "timeline": [],
      "dropped_items": [],
      "candidates": [],
      "evidence": [],
      "robustness": {}
    }
  },
  "explain": {
    "decision_log": []
  },
  "observability": {
    "latency_ms": 1234,
    "router_ms": 45,
    "system_mode": "SYSTEM1|SYSTEM2",
    "tool_calls": 3,
    "browser_steps": 0,
    "tokens_est": 0,
    "cost_est_usd": 0.0,
    "fallback_used": false
  }
}
```

## 核心组件

### RouterService
语义路由服务，根据用户输入决定走 System 1 还是 System 2。

**策略：**
- 硬规则短路（支付/退款/浏览器 → System2）
- 特征提取与打分
- 置信度阈值判断

### OrchestratorService
System 2 的 ReAct 循环执行器。

**流程：**
1. Plan: 选择下一个 Action
2. Act: 执行 Action
3. Observe: 收集观察结果
4. Critic: 检查可行性
5. Repair: 修复问题（如需要）

### ActionRegistryService
Action 注册与发现服务。

**注册 Action:**
```typescript
actionRegistry.register({
  name: 'trip.load_draft',
  description: '加载行程草稿',
  metadata: {
    kind: ActionKind.INTERNAL,
    cost: ActionCost.LOW,
    side_effect: ActionSideEffect.NONE,
    preconditions: ['trip.trip_id'],
    idempotent: true,
    cacheable: true,
  },
  input_schema: { ... },
  output_schema: { ... },
  execute: async (input, state) => { ... },
});
```

### CriticService
可行性检查服务。

**检查项：**
- 时间窗约束
- 日界约束
- 午餐锚点（每天且仅一个）
- 鲁棒交通时间
- 等待显性化（>15min 必须显示）

### AgentStateService
AgentState（Working Memory）管理服务。

所有模块只读写这个 state，禁止散落临时状态。

## 集成现有模块

### 注册 Actions

在 `agent.module.ts` 中注册 Actions：

```typescript
// 创建 Actions
const tripActions = createTripActions(this.tripsService);
this.actionRegistry.registerMany(tripActions);
```

### 创建 Action 定义

参考 `services/actions/trip.actions.ts` 和 `services/actions/places.actions.ts`。

## 待实现功能

- [ ] 埋点与监控（observability events）
- [ ] Transport Actions 注册
- [ ] Itinerary Optimization Actions 注册
- [ ] Policy/Critic Actions 注册
- [ ] WebBrowse 执行器（如需要）
- [ ] LLM 集成（用于 Plan 阶段）

## 参考文档

- `docs/TechSpec_OmniTravelAgent_v1.md` - 技术规格文档
- `docs/AlgoSpec_ItineraryOptimization_v1.md` - 算法规格文档

