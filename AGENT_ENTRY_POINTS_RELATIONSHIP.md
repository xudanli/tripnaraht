# 智能体入口关系说明

## 概述

TripNARA 有两类智能体入口：

1. **统一入口** (`/api/agent/route_and_run`) - 对话式智能体
2. **专用接口** - 功能式智能体（规划工作台/执行阶段/行程详情页）

---

## 1. 统一入口：`/api/agent/route_and_run`

### 定位
**对话式智能体统一入口** - 用户用自然语言提问，系统自动理解并执行

### 功能
- **语义路由**：根据用户输入自动路由到 System 1 或 System 2
- **自动编排**：自动选择和执行 Actions/Skills
- **对话式交互**：支持多轮对话，理解上下文

### 路由策略
```
用户输入 → RouterService → System 1/System 2 → Actions/Skills → 结果
```

**System 1**（快速路径，< 3秒）：
- `SYSTEM1_API`: 标准 API / CRUD / 简单查询
- `SYSTEM1_RAG`: 知识库/向量检索

**System 2**（推理路径，< 60秒）：
- `SYSTEM2_REASONING`: ReAct 循环 + 工具 + TravelPlanner/Critic
- `SYSTEM2_WEBBROWSE`: 无头浏览器兜底（仅授权后）

### 使用场景

#### ✅ 适合使用统一入口的场景

1. **自然语言对话**
   ```
   用户："帮我规划一个5天的东京行程"
   → 统一入口自动理解意图
   → 路由到 System2_REASONING
   → 调用相关 Skills（可能包括 planning-workbench 的技能）
   → 返回结果
   ```

2. **模糊需求**
   ```
   用户："我想去日本，但不知道去哪"
   → 统一入口理解需要推荐
   → 调用推荐相关的 Actions/Skills
   ```

3. **多步骤任务**
   ```
   用户："如果赶不上日落就改去横滨"
   → 统一入口理解条件逻辑
   → 执行 Plan-and-Execute 模式
   → 调用多个 Skills 协作完成
   ```

4. **简单查询**
   ```
   用户："推荐新宿拉面"
   → 统一入口路由到 System1_RAG
   → 快速返回结果
   ```

### 如何调用专用 Agent

统一入口**可以**调用专用 Agent，通过以下方式：

#### 方式 1：通过 Actions（✅ 已实现）

已在 `ActionRegistry` 中注册 Actions，这些 Actions 内部调用专用 Agent：

**已创建的 Actions**：
- `planning.workbench.generate` - 生成行程骨架方案
- `planning.workbench.compare` - 对比多个方案
- `execution.remind` - 生成执行阶段的提醒
- `execution.handle_change` - 处理执行期间的变更
- `trip.detail.get_status` - 理解当前行程状态
- `trip.detail.get_health` - 分析行程健康度
- `trip.detail.explain_decisions` - 解释决策

**使用示例**：
```typescript
// 用户："帮我规划一个5天的东京行程"
// → 统一入口理解意图
// → Router 路由到 System2_REASONING
// → LLM 选择 Action: planning.workbench.generate
// → Action 内部调用 PlanningWorkbenchAgentService
// → 返回三人格决策结果
```

**文件位置**：
- `src/agent/services/actions/planning.actions.ts`
- `src/agent/services/actions/execution.actions.ts`
- `src/agent/services/actions/trip-detail.actions.ts`

#### 方式 2：通过 Claude 编排

`ClaudeOrchestratorService` 可以让 LLM 直接选择 Skills，包括规划工作台的 Skills：

```typescript
// ClaudeOrchestratorService 可以选择：
// - plan.architect.generateSkeleton
// - plan.budget.estimateBaseline
// - exec.remind
// - detail.analyzeHealth
// 等等
```

#### 方式 3：直接调用（不推荐）

统一入口可以直接注入专用 Agent 服务并调用，但这样会破坏架构的清晰性。

---

## 2. 专用接口

### 定位
**功能式智能体接口** - 前端明确知道要调用哪个功能，直接调用对应的接口

### 三个专用接口

#### 规划工作台：`/api/planning-workbench/execute`
- **用途**：规划阶段的决策与取舍
- **输入**：结构化的规划上下文（destination, days, constraints）
- **输出**：三人格的决策结果（Abu/Dr.Dre/Neptune）

#### 执行阶段：`/api/execution/execute`
- **用途**：执行期间的提醒、变更处理、兜底
- **输入**：操作类型（remind/handle_change/fallback）
- **输出**：提醒列表、变更处理结果、兜底方案

#### 行程详情页：`/api/trip-detail/execute`
- **用途**：理解与掌控旅行现状
- **输入**：操作类型（get_status/get_health/explain_decisions/show_evidence）
- **输出**：状态理解、健康度、决策解释、证据

### 使用场景

#### ✅ 适合使用专用接口的场景

1. **明确的业务场景**
   ```
   前端：用户在规划工作台页面，点击"生成方案"按钮
   → 直接调用 POST /api/planning-workbench/execute
   → 传入结构化的 context
   → 返回三人格决策结果
   ```

2. **需要结构化输入**
   ```
   前端：用户填写了目的地、天数、预算等约束
   → 直接调用 POST /api/planning-workbench/execute
   → 传入完整的 PlanContext
   → 获得结构化的 PlanState 和三人格输出
   ```

3. **需要特定格式的输出**
   ```
   前端：需要显示三人格卡片
   → 直接调用专用接口
   → 获得标准化的 personas 输出
   → 直接渲染 UI
   ```

4. **性能要求高**
   ```
   前端：需要快速获取行程健康度
   → 直接调用 GET /api/trip-detail/:tripId/health
   → 跳过路由和意图理解
   → 快速返回结果
   ```

---

## 关系图

```
┌─────────────────────────────────────────────────────────┐
│                   用户交互层                              │
└─────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼────────┐            ┌─────────▼──────────┐
│  统一入口      │            │   专用接口          │
│                │            │                     │
│ /api/agent/    │            │ /api/planning-     │
│ route_and_run  │            │  workbench/execute │
│                │            │                     │
│ 对话式交互     │            │ /api/execution/     │
│ 自然语言理解   │            │  execute           │
│ 自动路由       │            │                     │
│ 自动编排       │            │ /api/trip-detail/  │
│                │            │  execute           │
└───────┬────────┘            └─────────┬──────────┘
        │                               │
        │  可以调用（通过 Actions）      │
        │                               │
        └───────────────┬───────────────┘
                        │
        ┌───────────────▼───────────────┐
        │      Skills / Actions         │
        │                               │
        │  - plan.architect.*           │
        │  - plan.budget.*              │
        │  - exec.remind                │
        │  - detail.analyzeHealth       │
        │  - ...                        │
        └───────────────────────────────┘
```

---

## 使用建议

### 何时使用统一入口

✅ **使用统一入口**，当：
- 用户用自然语言提问（"帮我规划行程"）
- 需求不明确，需要系统理解意图
- 需要多步骤协作（"如果A就B，否则C"）
- 简单查询（"推荐拉面"）

### 何时使用专用接口

✅ **使用专用接口**，当：
- 前端明确知道要执行的功能（规划/执行/详情）
- 需要结构化的输入输出
- 需要特定的数据格式（三人格输出、健康度雷达图等）
- 性能要求高，需要跳过路由和意图理解
- 前端需要精确控制流程（生成 → 对比 → 提交）

---

## 集成方案

### 方案 1：统一入口调用专用 Agent（✅ 已实现）

**优点**：
- 保持统一入口的灵活性
- 专用 Agent 可以被统一入口复用
- 架构清晰，职责分离

**实现**：
1. ✅ 已在 `ActionRegistry` 中注册 Actions
2. ✅ 这些 Actions 内部调用专用 Agent
3. ✅ 统一入口通过选择 Actions 间接调用专用 Agent

**示例**：
```typescript
// 用户："帮我规划一个5天的东京行程"
// → 统一入口理解意图
// → Router 路由到 System2_REASONING
// → LLM 选择 Action: planning.workbench.generate
// → Action 内部调用 PlanningWorkbenchAgentService
// → 返回三人格决策结果
```

**已注册的 Actions**：
- `planning.workbench.generate` - 调用 PlanningWorkbenchAgentService
- `planning.workbench.compare` - 调用 PlanningWorkbenchAgentService
- `execution.remind` - 调用 ExecutionAgentService
- `execution.handle_change` - 调用 ExecutionAgentService
- `trip.detail.get_status` - 调用 TripDetailAgentService
- `trip.detail.get_health` - 调用 TripDetailAgentService
- `trip.detail.explain_decisions` - 调用 TripDetailAgentService

### 方案 2：统一入口直接调用专用 Agent（不推荐）

**缺点**：
- 破坏架构清晰性
- 增加耦合
- 难以维护

### 方案 3：两者并行（✅ 当前状态）

**现状**：
- ✅ 统一入口和专用接口并行存在
- ✅ 前端根据场景选择使用哪个
- ✅ 统一入口可以通过 Actions 调用专用 Agent（已实现）

**优点**：
- 灵活性高
- 前端可以选择最适合的入口
- 逐步迁移，不破坏现有功能
- 统一入口可以复用专用 Agent 的能力

---

## 总结

### 统一入口的作用

1. **对话式交互**：用户用自然语言提问，系统自动理解并执行
2. **自动路由**：根据用户输入自动选择 System 1 或 System 2
3. **自动编排**：自动选择和执行 Actions/Skills
4. **复用专用 Agent**：可以通过 Actions 调用专用 Agent 的功能

### 专用接口的作用

1. **功能式交互**：前端明确调用特定功能
2. **结构化输入输出**：标准化的数据格式
3. **性能优化**：跳过路由和意图理解，直接执行
4. **精确控制**：前端可以精确控制流程

### 最佳实践

- **对话场景** → 使用统一入口
- **功能场景** → 使用专用接口
- **统一入口可以调用专用 Agent** → 通过 Actions 或 Skills

两者是**互补关系**，不是替代关系。
