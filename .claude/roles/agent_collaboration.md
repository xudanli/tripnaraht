# Agent 协作机制文档

## 概述

本文档描述 TripNARA 项目中各个 Agent 的协作机制，基于 **AI-Native 决策系统架构**（五层架构、Decision Node、多 Agent 协作）。

> **核心理念**：TripNARA 是一个以「旅行决策」为核心的 AI-native 系统。LLM 不在架构中心，它只是被调用的"推理器官"。

## AI-Native 五层架构愿意


```
┌──────────────────────────────────────────────┐
│           Decision Experience Layer          │
│   决策体验层 - Narrator, TripDetail          │
├──────────────────────────────────────────────┤
│        Decision Orchestration Layer          │
│   决策编排层 - PlanningWorkbench (Conductor)  │
├──────────────────────────────────────────────┤
│          Decision Core Engine                │
│   决策内核 - Planner, Gatekeeper, CoreDecision│
├──────────────────────────────────────────────┤
│       World Model & Context Layer            │
│   世界模型层 - GeoAgent, WeatherAgent, etc.   │
├──────────────────────────────────────────────┤
│        Signal & Feedback Loop                │
│   信号与学习层 - Execution Agent              │
└──────────────────────────────────────────────┘
```

## Agent 分工总览

### Conductor Agent（编排层）

| Agent | 职责 |
|-------|------|
| **PlanningWorkbench** | Conductor - 拆问题、聚合冲突、输出可解释决策 |

### Core Decision Agents（决策内核）

| Agent | 职责 | 人格映射 |
|-------|------|----------|
| **Planner** | Decision Node 拆解、缺口识别、方案结构设计 | - |
| **Gatekeeper** | 约束守门（Hard/Soft）、Should-Exist Gate | **Abu** |
| **CoreDecision** | 权衡模型、多方案评估、不确定性量化 | **Dr.Dre** |
| **LocalInsight** | 世界模型注入、替代方案、空间修复 | **Neptune** |
| **Compliance** | 风险分类、合规检查、免责留痕 | - |

### Domain Agents（世界模型层）

| Agent | 职责 |
|-------|------|
| **GeoAgent** | 地理结构 & 路线可行性 |
| **WeatherAgent** | 气象条件 & 封路概率 |
| **CostAgent** | 价格曲线 & 预算优化 |
| **ExperienceAgent** | 体验密度 & 节奏优化 |

### Experience Agents（体验层）

| Agent | 职责 |
|-------|------|
| **Narrator** | 决策理由可视化、排除过程展示 |
| **TripDetail** | 决策回放、反事实模拟（What-if）、历史风格建模 |
| **Execution** | 执行信号采集、偏差反馈、RLHF 闭环 |

**详细 Agent 定义**：`prompts/agents/README.md`

## 统一入口架构

### 入口点

```
POST /agent/route_and_run
    ↓
AgentController.routeAndRun()
    ↓
AgentService.routeAndRun()
```

### 路由策略

`AgentService.routeAndRun()` 根据策略决策选择执行路径：

```typescript
// 1. 信号提取
const signals = signalsFromRequest(request);

// 2. 策略决策
const decision = routePolicy(env, options, signals);
// decision.mode: 'LEGACY' | 'CLAUDE_DYNAMIC' | 'CLAUDE_SM'

// 3. 根据模式路由
switch (decision.mode) {
  case 'CLAUDE_SM':
    return routeAndRunWithClaudeStateMachine(request, ...);
  case 'CLAUDE_DYNAMIC':
    return routeAndRunWithClaude(request, ...);
  case 'LEGACY':
    return legacyRouteAndRun(request, ...);
}
```

**参考文件**：
- `src/agent/services/agent.service.ts`
- `src/agent/utils/orchestration-signals.util.ts`
- `src/agent/utils/orchestration-policy.util.ts`

## CLAUDE_SM 状态机协作流程

### 流程概览

```
INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → REPAIR → NARRATE → DONE
```

**关键约束**：
- **Gate 必须在 Plan 之前**（硬约束）
- **Gate = BLOCK 时直接返回**，不执行后续步骤
- **REPAIR 条件执行**：仅在 `gate_result = ADJUST_REQUIRED` 或 `errors.length > 0` 时执行
- **NARRATE 不得修改硬字段**（只读约束）

### 步骤 1: INTAKE（PlannerAgent）

**负责 Agent**：`ClaudePlannerAgentService`

**职责**：
- 解析用户请求
- 识别信息缺口（gaps）
- 返回分析结果

**输出**：
- `OrchestratorState.gaps`: 缺失信息列表
- `OrchestratorState.trip_plan_request`: 解析后的请求

**状态更新**：
```typescript
state.current_step = 'INTAKE';
state.gaps = [...];
state.trip_plan_request = {...};
```

### 步骤 2: RESEARCH（Skills 并行调用）

**负责 Agent**：无（直接调用 Skills）

**职责**：
- 并行调用多个 Skills 收集硬数据
- 将结果存储到 `research_data`

**调用的 Skills**：
- `transport.search` - 交通搜索
- `poi.search` - POI 搜索
- `opening_hours.get` - 开放时间
- `dem.get.profile` - DEM 数据
- `geo.check.hazard.zones` - 风险区域检查

**输出**：
- `OrchestratorState.research_data`: Skills 返回的数据
- `OrchestratorState.evidence_registry`: 证据注册表

**状态更新**：
```typescript
state.current_step = 'RESEARCH';
state.research_data = {
  transport: {...},
  poi: {...},
  opening_hours: {...},
  dem: {...},
  risk: {...},
};
// 将每个 Skill 返回的数据包装为 EvidenceRef 存入 evidence_registry
```

### 步骤 3: GATE_EVAL（GatekeeperAgent → Abu）

**负责 Agent**：`ClaudeGatekeeperAgentService`（映射到 **Abu**）

**职责**：
- 执行 Should-Exist Gate 评估
- 硬门控检查（不可达/高风险/关键证据缺失 → BLOCK）
- 软评分检查（疲劳高/节奏满/体验差 → ADJUST_REQUIRED）
- 三人格评审（`PlanGateRunThreeGuardiansSkill`）

**关键约束**：**必须在 PLAN_GEN 之前执行**（硬约束）

**输出**：
- `OrchestratorState.gate_result`: `GateResult`
  - `gate_result`: `ALLOW` / `BLOCK` / `ADJUST_REQUIRED` / `NEED_USER_CONFIRM`
  - `guardian_results`: 三人格评审结果
    - `abu`: Abu 的裁决
    - `drdre`: Dr.Dre 的裁决
    - `neptune`: Neptune 的裁决

**状态更新**：
```typescript
state.current_step = 'GATE_EVAL';
state.gate_result = {
  gate_result: 'ALLOW' | 'BLOCK' | 'ADJUST_REQUIRED' | 'NEED_USER_CONFIRM',
  violations: [...],
  required_adjustments: [...],
  guardian_results: {
    abu: { verdict: 'ALLOW' | 'REJECT', evidence: [...] },
    drdre: { verdict: 'ALLOW' | 'ADJUST' | 'REJECT', evidence: [...] },
    neptune: { verdict: 'ALLOW' | 'REPLACE' | 'REJECT', evidence: [...] },
  },
};
```

**如果 `gate_result = 'BLOCK'`**：直接返回阻止结果，不执行后续步骤。

**如果 `gate_result = 'NEED_USER_CONFIRM'`**：状态机暂停，等待用户确认后恢复。

### 步骤 4: PLAN_GEN（PlannerAgent）

**负责 Agent**：`ClaudePlannerAgentService`

**执行条件**：仅在 `gate_result = 'ALLOW'` 或 `'ADJUST_REQUIRED'` 时执行

**职责**：
- 生成结构化行程草案
- 调用 `itinerary.generate` Skill

**输出**：
- `OrchestratorState.itinerary`: `Itinerary`

**状态更新**：
```typescript
state.current_step = 'PLAN_GEN';
state.itinerary = {
  request_id: string;
  days: ItineraryDay[];
  metadata: {...};
};
```

### 步骤 5: VERIFY（验证逻辑）

**负责 Agent**：验证逻辑（可调用 `itinerary.verify` Skill）

**职责**：
- 验证开放时间冲突
- 验证换乘 buffer
- 验证可达性
- 验证疲劳阈值（**Dr.Dre 负责**）

**输出**：
- `OrchestratorState.errors`: 验证发现的错误列表

**状态更新**：
```typescript
state.current_step = 'VERIFY';
state.errors = [
  {
    step: 'VERIFY',
    error_code: 'OPENING_HOURS_CONFLICT',
    message: '...',
    timestamp: '...',
  },
];
```

### 步骤 6: REPAIR（LocalInsightAgent → Neptune）

**负责 Agent**：`ClaudeLocalInsightAgentService`（映射到 **Neptune**）

**执行条件**：仅在 `gate_result = 'ADJUST_REQUIRED'` 或 `errors.length > 0` 时执行

**职责**：
- 替换 POI
- 改路线
- 加 buffer
- 换交通方式
- 调用 `repair.apply` Skill

**输出**：
- 修改后的 `itinerary`
- `OrchestratorState.alternatives`: 替代方案

**状态更新**：
```typescript
state.current_step = 'REPAIR';
state.itinerary = {...}; // 修复后的行程
state.alternatives = {
  alternative_pois: [...],
  alternative_routes: [...],
};
```

### 步骤 7: NARRATE（NarratorAgent）

**负责 Agent**：`ClaudeNarratorAgentService`

**职责**：
- 生成用户可读解释
- 逐日叙述
- 亮点和提示

**关键约束**：**不得修改硬字段**（itinerary、gate_result 等）

**输出**：
- `OrchestratorState.narration`: 叙述内容

**状态更新**：
```typescript
state.current_step = 'NARRATE';
state.narration = {
  user_friendly_summary: string;
  day_by_day_narrative: Array<{ day: number; date: string; narrative: string }>;
  highlights: string[];
  tips: string[];
  warnings?: string[];
};
```

### 步骤 8: DONE / FAILED

**状态更新**：
```typescript
state.current_step = 'DONE' | 'FAILED';
state.metadata.last_updated_at = new Date().toISOString();
state.metadata.total_duration_ms = Date.now() - startTime;
```

**构建响应**：
- `RouteAndRunResponseDto` 包含完整的 `orchestrationResult`

## 三人格映射规则

### Abu（GatekeeperAgent）

**调用时机**：GATE_EVAL 步骤

**职责**：
- 安全与现实守门（Should-Exist Gate）
- 检查可达性、风险、合规性
- 返回 `ALLOW` / `BLOCK` / `NEED_CONFIRM`

**输出位置**：
- `GateResult.guardian_results.abu`

### Dr.Dre（PaceAgent / CoreDecisionAgent）

**调用时机**：
- VERIFY 步骤（疲劳评分、时间窗验证）
- PLAN_GEN 步骤（节奏规划）

**职责**：
- 节奏与体感（人体可执行性）
- 计算疲劳评分
- 检查时间窗冲突
- 验证人体可执行性

**输出位置**：
- 疲劳评分存储在 `OrchestratorState` 的 pace 相关字段
- 节奏调整建议

### Neptune（LocalInsightAgent）

**调用时机**：REPAIR 步骤

**职责**：
- 空间结构修复（路线哲学与自洽）
- 生成替代路线
- 修复空间不自洽
- 优化路线哲学

**输出位置**：
- `OrchestratorState.alternatives`

## 数据流

### Decision Node 流转

所有 Agent 的协作围绕 **Decision Node** 进行：

```typescript
interface DecisionNode {
  nodeId: string;
  context: WorldState;           // 世界状态
  constraints: HardConstraint[]; // 硬约束
  preferences: SoftPreference[]; // 软偏好
  options: Option[];             // 候选方案
  tradeOff: TradeOffModel;       // 权衡逻辑
  confidence: number;            // 置信度
  uncertainty: UncertaintyProfile; // 不确定性分布
}
```

**Decision Node 流转**：
1. **Planner** 拆解用户请求 → 生成 Decision Node 树
2. **Domain Agents** 填充世界模型数据 → 更新 `context`
3. **Gatekeeper** 评估约束 → 更新 `constraints` 状态
4. **CoreDecision** 执行权衡 → 更新 `options` 评分和 `tradeOff`
5. **Narrator** 可视化 → 将 Decision Node 投影为用户可理解的展示

### 状态共享

所有 Sub-Agents 通过 `OrchestratorState` 共享状态：

```typescript
interface OrchestratorState {
  request_id: string;
  current_step: OrchestrationStep;
  
  // Decision Node 相关
  decision_tree?: {
    root: DecisionNode;
    nodes: Map<string, DecisionNode>;
  };
  constraint_system?: {
    hard_constraints: HardConstraint[];
    soft_preferences: SoftPreference[];
  };
  
  // 传统字段
  trip_plan_request?: TripPlanRequest;
  gaps?: Array<{...}>;
  research_data?: Record<string, any>;  // RESEARCH 步骤收集
  gate_result?: GateResult;  // GATE_EVAL 步骤生成
  itinerary?: Itinerary;  // PLAN_GEN 步骤生成
  alternatives?: {...};  // REPAIR 步骤生成
  narration?: {...};  // NARRATE 步骤生成
  evidence_registry: Map<string, EvidenceRef>;  // 所有步骤共享
  decision_log: DecisionLogEntry[];  // 所有步骤共享
  errors: Array<{...}>;
  metadata: {...};
}
```

### 证据链

1. **RESEARCH 步骤**：收集证据 → `evidence_registry`
2. **每个决策步骤**：记录到 `decision_log`，关联 `evidence_refs`
3. **最终输出**：`RouteAndRunResponseDto.explain.decision_log`

### 决策日志

每个 Sub-Agent 执行时都应该记录决策日志：

```typescript
state.decision_log.push({
  request_id: state.request_id,
  step: state.current_step,
  actor: 'Planner' | 'Gatekeeper' | 'LocalInsight' | 'Narrator' | ...,
  inputs_summary: '...',
  outputs_summary: '...',
  evidence_refs: [...],  // 关联的证据 ID
  timestamp: new Date().toISOString(),
  metadata: {
    guardian?: 'ABU' | 'DR_DRE' | 'NEPTUNE',  // 可选：归因到三人格
  },
});
```

## 错误处理与降级

### Skills 调用失败

**策略**：
- 记录警告到 `state.errors`
- 如果可能，继续执行（使用部分数据）
- 如果关键数据缺失，标记为 `NEED_USER_CONFIRM` 或 `BLOCK`

### Gate 评估失败

**策略**（参考 `GatekeeperAgent`）：
- 降级：返回 `NEED_USER_CONFIRM`
- 记录到 `decision_log`

### 状态机步骤失败

**策略**：
- `state.current_step = 'FAILED'`
- 记录错误到 `state.errors`
- 返回失败结果

## Conductor Agent 编排流程

PlanningWorkbench 作为 **Conductor Agent**，负责编排所有其他 Agent 的协作：

### 编排 Phase

```
Phase 1: INTAKE（问题拆解）
    Planner → Decision Node 拆解、约束识别、缺口识别
         ↓
Phase 2: RESEARCH（并行研究）
    GeoAgent + WeatherAgent + CostAgent + ExperienceAgent
    并行执行，填充世界模型数据
         ↓
Phase 3: GATE_EVAL（门控评估）
    Gatekeeper (Abu) → 硬门控 + 软门控
         ↓
Phase 4: PLAN_GEN（方案生成）
    CoreDecision (Dr.Dre) → 多方案评估、权衡分析、不确定性量化
    LocalInsight (Neptune) → 替代方案、空间修复
         ↓
Phase 5: VERIFY（验证与合规）
    Compliance → 风险评估、免责声明、用户确认设计
         ↓
Phase 6: NARRATE（可视化）
    Narrator → 排除过程可视化、权衡代价可视化、不确定性可视化
```

### 冲突解决策略

| 冲突类型 | 解决策略 |
|----------|----------|
| Hard vs Hard | 报错，请求用户修改输入 |
| Hard vs Soft | Hard 优先 |
| Soft vs Soft | 权衡计算或升级为用户判断 |

## Decision Replay 集成

Decision Replay 服务允许回溯和模拟决策过程：

### 快照时机

| 时机 | 触发方式 | 用途 |
|------|----------|------|
| 每个 Phase 完成 | AUTO | 时间线追踪 |
| 关键决策点 | CHECKPOINT | 回放起点 |
| 用户交互 | USER_ACTION | What-If 基准 |

### API 端点

```
GET  /api/v1/decision-replay/timeline/:tripRunId       - 获取时间线
GET  /api/v1/decision-replay/snapshot/:tripRunId/:id   - 获取快照
POST /api/v1/decision-replay/replay/:tripRunId/:id     - 回放到快照
POST /api/v1/decision-replay/what-if                   - What-If 模拟
GET  /api/v1/decision-replay/style/:userId             - 获取决策风格
```

### 集成点

```typescript
// 在 PLAN_GEN 步骤完成后创建快照
decisionReplayService.createSnapshot(state, 'CHECKPOINT', decisionNode, decisionOutput);

// 用户探索 What-If
const whatIfResult = decisionReplayService.simulateWhatIf(input, decisionOutput);
```

## RLHF Signal 收集

RLHF Signal Collector 收集用户反馈用于持续学习：

### 信号类型

| 类型 | 收集方式 | 示例 |
|------|----------|------|
| **行为信号** | 被动收集 | 查看时长、点击、展开详情 |
| **执行信号** | 行程执行 | 偏差、跳过、延迟 |
| **反馈信号** | 显式反馈 | 接受、拒绝、评分、评论 |

### API 端点

```
POST /api/v1/rlhf/behavior              - 记录行为信号
POST /api/v1/rlhf/execution             - 记录执行信号
POST /api/v1/rlhf/feedback              - 记录反馈信号
POST /api/v1/rlhf/quality/:tripRunId/:decisionPointId - 质量评估
GET  /api/v1/rlhf/learning/:tripRunId   - 生成学习信号
GET  /api/v1/rlhf/summary/:tripRunId    - 信号摘要
```

### 信号流

```
用户交互 → 行为信号收集
     ↓
决策接受/拒绝 → 反馈信号收集
     ↓
行程执行 → 执行信号收集
     ↓
质量评估 → 改进信号生成
     ↓
模型调优 ← 学习信号
```

### 集成点

```typescript
// 用户查看方案
rlhfService.recordPlanViewTime(tripRunId, planId, durationMs);

// 用户接受推荐
rlhfService.recordAcceptance(tripRunId, decisionPointId, chosenOptionId);

// 行程执行偏差
rlhfService.recordDeviation(tripRunId, itemId, plannedTime, actualTime, reason);

// 评估决策质量
const assessment = rlhfService.assessDecisionQuality(tripRunId, decisionPointId, decisionOutput);

// 生成学习信号
const learningSignals = rlhfService.generateLearningSignals(tripRunId);
```

## 参考文件

- `prompts/agents/README.md` - AI-native 决策系统架构
- `prompts/agents/*.md` - 各 Agent 详细定义
- `src/agent/services/claude-orchestrator.service.ts` - 状态机实现
- `src/agent/services/sub-agents/*` - Sub-Agents 实现
- `src/agent/services/domain-agents/*` - Domain Agents 实现
- `src/agent/services/decision-replay.service.ts` - Decision Replay 服务
- `src/agent/services/rlhf-signal-collector.service.ts` - RLHF Signal 服务
- `src/agent/controllers/decision-replay.controller.ts` - Decision Replay API
- `src/agent/controllers/rlhf-signal.controller.ts` - RLHF Signal API
- `src/agent/interfaces/trip-plan.interface.ts` - 数据合同
- `src/agent/interfaces/sub-agent.interface.ts` - Sub-Agent 接口
- `src/agent/interfaces/decision-node.interface.ts` - Decision Node 接口
- `src/agent/AI_NATIVE_API_REFERENCE.md` - API 文档
- `docs/AGENT_CALL_SEQUENCE.md` - 详细调用顺序
