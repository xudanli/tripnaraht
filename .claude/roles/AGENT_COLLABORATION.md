# Agent 协作机制文档

## 概述

本文档描述 TripNARA 项目中各个 Agent 的协作机制，基于项目实际架构（统一入口、三种编排模式、状态机流程、三人格系统）。

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

### 状态共享

所有 Sub-Agents 通过 `OrchestratorState` 共享状态：

```typescript
interface OrchestratorState {
  request_id: string;
  current_step: OrchestrationStep;
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

## 参考文件

- `src/agent/services/claude-orchestrator.service.ts` - 状态机实现
- `src/agent/services/sub-agents/*` - Sub-Agents 实现
- `src/agent/interfaces/trip-plan.interface.ts` - 数据合同
- `src/agent/interfaces/sub-agent.interface.ts` - Sub-Agent 接口
- `docs/AGENT_CALL_SEQUENCE.md` - 详细调用顺序
