# Agent 层 Readiness 集成

## 概述

本文档说明如何将 Readiness（旅行准备度检查）模块集成到 Agent 层，使 Agent 在规划行程时能够自动检查准备度。

## 实现状态

### ✅ 已完成

1. **AgentModule 集成** - 已实现
   - 位置：`src/agent/agent.module.ts`
   - 功能：
     - 导入 `ReadinessModule` 和 `DecisionModule`
     - 注入 `ReadinessService`
     - 注册 `readiness.check` Action

2. **Readiness Action** - 已实现
   - 位置：`src/agent/services/actions/readiness.actions.ts`
   - 功能：
     - `readiness.check` - 检查旅行准备度
     - 支持地理特征增强
     - 返回 findings、summary、constraints、tasks

3. **Orchestrator 集成** - 已实现
   - 位置：`src/agent/services/orchestrator.service.ts`
   - 功能：
     - 在 `plan()` 方法中，当有 `trip_id` 时自动检查 readiness
     - 先加载 trip 信息（`trip.load_draft`），再检查 readiness
     - 在 `updateStateFromAction()` 中处理 readiness 结果

4. **状态存储** - 已实现
   - 位置：`src/agent/services/orchestrator.service.ts:1206-1225`
   - 功能：
     - 将 readiness 结果存储到 `state.memory.readiness`
     - 包含 findings、summary、constraints、tasks

## 工作流程

```
用户请求（带 trip_id）
  ↓
Agent.routeAndRun()
  ↓
Orchestrator.execute() - ReAct 循环
  ↓
Plan: 检测到 trip_id
  ├─→ trip.load_draft (如果尚未加载)
  └─→ readiness.check (如果已加载 trip 且尚未检查)
  ↓
Act: 执行 readiness.check
  ├─→ ReadinessService.checkFromDestination()
  ├─→ GeoFactsService.getGeoFeaturesForPoint()  ✅ 地理特征增强
  └─→ 返回 readiness 结果
  ↓
Observe: 收集结果
  ↓
updateStateFromAction()
  ├─→ 存储到 state.memory.readiness  ✅
  └─→ 存储到 state.tripInfo (trip.load_draft)  ✅
  ↓
后续步骤可以使用 readiness 信息
```

## 使用场景

### 场景 1：自动检查准备度

当用户请求包含 `trip_id` 时，Agent 会自动：
1. 加载 trip 信息
2. 检查准备度（基于目的地、行程信息、地理特征）
3. 将准备度信息存储到 state 中
4. 可以在后续步骤中使用这些信息

### 场景 2：在决策中使用

Readiness 信息存储在 `state.memory.readiness` 中，可以：
- 传递给决策层（TripDecisionEngineService）
- 在生成计划时考虑准备度约束
- 在约束检查中包含 readiness violations

## Action 定义

### readiness.check

**输入**:
```typescript
{
  destination_id: string;  // 必需
  traveler?: {
    nationality?: string;
    budget_level?: 'low' | 'medium' | 'high';
    risk_tolerance?: 'low' | 'medium' | 'high';
  };
  trip?: {
    start_date?: string;
    end_date?: string;
  };
  itinerary?: {
    countries?: string[];
    activities?: string[];
    season?: string;
  };
  geo?: {
    lat?: number;
    lng?: number;
    enhance_with_geo?: boolean;
  };
}
```

**输出**:
```typescript
{
  findings: ReadinessFinding[];
  summary: {
    total_blockers: number;
    total_must: number;
    total_should: number;
    total_optional: number;
    total_risks: number;
  };
  constraints: ReadinessConstraint[];
  tasks: Array<{
    title: string;
    due_offset_days: number;
    tags: string[];
  }>;
}
```

## 集成点

### 1. Plan 阶段

在 `Orchestrator.plan()` 中：
- 检查是否有 `trip_id`
- 如果没有 trip 信息，先执行 `trip.load_draft`
- 如果有 trip 信息且尚未检查 readiness，执行 `readiness.check`

### 2. Act 阶段

Action 执行后，结果通过 `updateStateFromAction()` 处理：
- `trip.load_draft` → 存储到 `state.tripInfo`
- `readiness.check` → 存储到 `state.memory.readiness`

### 3. 后续使用

Readiness 信息可以在：
- 决策层生成计划时使用
- 约束检查时使用
- 前端展示准备清单时使用

## 注意事项

1. **执行顺序**
   - 必须先执行 `trip.load_draft` 获取 trip 信息
   - 然后才能执行 `readiness.check`

2. **避免重复检查**
   - 通过 `decision_log` 检查是否已执行过
   - 每个 trip 只检查一次

3. **地理特征增强**
   - 需要提供坐标（`lat`, `lng`）才能启用
   - 如果没有坐标，使用基础规则检查

4. **错误处理**
   - Readiness 检查失败不会阻断 Agent 流程
   - 只记录警告，继续执行其他步骤

## 相关文件

- `src/agent/agent.module.ts` - Agent 模块配置
- `src/agent/services/actions/readiness.actions.ts` - Readiness Actions
- `src/agent/services/orchestrator.service.ts` - Orchestrator 服务
- `src/trips/readiness/services/readiness.service.ts` - Readiness 服务
- `src/trips/decision/trip-decision-engine.service.ts` - 决策引擎
