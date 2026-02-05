# PlanningWorkbench - Conductor Agent

## 架构定位

**所属层级**：Decision Orchestration Layer（决策编排层）

PlanningWorkbench 是 TripNARA 的 **Conductor Agent**（指挥官），负责编排所有其他 Agent 的协作。核心职责是**拆问题、聚合冲突、输出可解释决策**。

> **核心理念**：Conductor 不做决策，而是编排决策过程

**项目实现位置**：
- 服务：`src/agent/services/planning-workbench-agent.service.ts`
- 控制器：`src/agent/planning-workbench.controller.ts`

### AI-Native 增强能力

PlanningWorkbench 现已集成以下 AI-Native 能力：

| 能力 | 说明 | 实现位置 |
|------|------|----------|
| **Domain Agents 编排** | 并行调用 GeoAgent、WeatherAgent、CostAgent、ExperienceAgent | `getWorldModelData()` |
| **Decision Replay** | 支持决策快照、时间线追踪、What-If 模拟 | `DecisionReplayService` |
| **RLHF 信号收集** | 收集行为、执行、反馈信号用于持续学习 | `RLHFSignalCollectorService` |

**架构图**：
```
┌─────────────────────────────────────────────────────────────┐
│               PlanningWorkbench (Conductor)                  │
├─────────────────────────────────────────────────────────────┤
│ INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → NARRATE│
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
  │DecisionReplay│   │Domain Agents│    │RLHFCollector│
  │   Service   │    │ (World Model)│   │   Service   │
  └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Conductor 三大职责

### 1. 拆问题（Decompose）

将用户请求拆解为可并行处理的子问题：

```typescript
interface ProblemDecomposition {
  // 原始请求
  originalRequest: TripPlanRequest;
  
  // 拆解后的子问题
  subProblems: Array<{
    problemId: string;
    problemType: 'GEO' | 'WEATHER' | 'COST' | 'EXPERIENCE' | 'RISK';
    description: string;
    assignedAgent: AgentType;
    dependencies: string[];  // 依赖的其他子问题
    parallelizable: boolean;
  }>;
  
  // 执行计划
  executionPlan: {
    phases: Array<{
      phaseId: string;
      parallelTasks: string[];  // 可并行的任务
      sequentialAfter?: string; // 在哪个 phase 之后
    }>;
  };
}
```

### 2. 聚合冲突（Aggregate & Resolve）

收集各 Agent 的输出，识别并解决冲突：

```typescript
interface ConflictResolution {
  // 各 Agent 输出
  agentOutputs: Map<AgentType, AgentOutput>;
  
  // 识别的冲突
  conflicts: Array<{
    conflictId: string;
    conflictType: 'CONSTRAINT_CONFLICT' | 'RESOURCE_CONFLICT' | 'PREFERENCE_CONFLICT';
    involvedAgents: AgentType[];
    description: string;
    severity: 'BLOCKING' | 'DEGRADING' | 'MINOR';
  }>;
  
  // 解决方案
  resolutions: Array<{
    conflictId: string;
    resolutionStrategy: 'PRIORITIZE' | 'COMPROMISE' | 'ESCALATE_TO_USER';
    resolution: string;
    tradeoff: string;
  }>;
}
```

### 3. 输出可解释决策（Explain）

确保最终输出是可解释的：

```typescript
interface ExplainableOutput {
  // 决策结果
  decision: DecisionResult;
  
  // 可解释性
  explainability: {
    // 决策过程
    decisionProcess: string;
    
    // 各 Agent 贡献
    agentContributions: Map<AgentType, string>;
    
    // 冲突解决说明
    conflictResolutionExplanation: string;
    
    // 用户可操作的判断点
    userJudgmentPoints: UserJudgmentPoint[];
  };
}
```

---

## 编排流程

### Phase 1: INTAKE（问题拆解）

```
用户请求
    ↓
┌─────────────────┐
│    Planner      │  → Decision Node 拆解
│                 │  → 约束系统识别
│                 │  → 缺口识别
└────────┬────────┘
         ↓
问题拆解 & 执行计划
```

### Phase 2: RESEARCH（并行研究）

```
         ↓ 并行执行
┌────────┬────────┬────────┬────────┐
│GeoAgent│Weather │CostAgt │ExpAgent│
│        │ Agent  │        │        │
└────┬───┴────┬───┴────┬───┴────┬───┘
     │        │        │        │
     └────────┴────────┴────────┘
                  ↓
           世界模型数据
```

### Phase 3: GATE_EVAL（门控评估）

```
世界模型数据
    ↓
┌─────────────────┐
│   Gatekeeper    │  → 硬门控检查
│     (Abu)       │  → 软约束评估
│                 │  → 修复建议
└────────┬────────┘
         ↓
门控结果 + 修复建议
```

### Phase 4: PLAN_GEN（方案生成）

```
门控结果
    ↓
┌─────────────────┐
│  CoreDecision   │  → 多方案评估
│    (Dr.Dre)     │  → 权衡分析
│                 │  → 不确定性量化
└────────┬────────┘
         ↓
┌─────────────────┐
│  LocalInsight   │  → 替代方案
│   (Neptune)     │  → 空间修复
│                 │  → 本地洞察
└────────┬────────┘
         ↓
多方案 + 权衡说明
```

### Phase 5: VERIFY（验证与合规）

```
多方案
    ↓
┌─────────────────┐
│   Compliance    │  → 风险评估
│                 │  → 免责声明
│                 │  → 用户确认设计
└────────┬────────┘
         ↓
验证通过的方案 + 风险说明
```

### Phase 6: NARRATE（可视化）

```
验证结果
    ↓
┌─────────────────┐
│    Narrator     │  → 排除过程可视化
│                 │  → 权衡代价可视化
│                 │  → 不确定性可视化
└────────┬────────┘
         ↓
最终输出（可解释决策）
```

---

## 输入/输出 Schema

### 输入：ConductorInput

```typescript
{
  request_id: string;
  
  // 用户请求
  trip_request: TripPlanRequest;
  
  // 现有状态（如果是增量更新）
  existing_plan_state?: PlanState;
  
  // 用户操作
  user_action?: 'GENERATE' | 'COMPARE' | 'ADJUST' | 'CONFIRM';
  
  // 用户判断输入
  user_judgments?: Array<{
    questionId: string;
    selectedOption: string;
  }>;
}
```

### 输出：ConductorOutput

```typescript
{
  request_id: string;
  
  // 核心：决策结果
  decision_result: {
    // 推荐方案
    recommended_plan: {
      planId: string;
      positioning: string;
      itinerary: Itinerary;
      confidence: number;
    };
    
    // 替代方案
    alternative_plans: Array<{
      planId: string;
      positioning: string;
      itinerary: Itinerary;
      whenToConsider: string;
    }>;
    
    // 被排除的方案
    eliminated_plans: Array<{
      planId: string;
      reason: string;
      stage: string;
    }>;
  };
  
  // 决策过程
  decision_process: {
    phases: Array<{
      phaseId: string;
      phaseName: string;
      agentsCalled: AgentType[];
      conflicts: Conflict[];
      resolutions: Resolution[];
      output: any;
    }>;
  };
  
  // 可解释性输出
  explainability: {
    decisionStory: string;
    tradeoffVisualization: TradeoffVisualization;
    uncertaintyVisualization: UncertaintyVisualization;
    riskVisualization: RiskVisualization;
  };
  
  // 用户判断点
  user_judgment_required: Array<{
    questionId: string;
    question: string;
    options: Array<{
      optionId: string;
      optionText: string;
      impact: string;
    }>;
    urgency: 'BLOCKING' | 'IMPORTANT' | 'OPTIONAL';
  }>;
  
  // 审计日志
  audit_log: AuditLog;
}
```

---

## 冲突解决策略

### 约束冲突

当不同 Agent 输出的约束相互冲突时：

| 冲突类型 | 解决策略 | 示例 |
|----------|----------|------|
| Hard vs Hard | 报错，请求用户修改输入 | 时间不够 vs 必去景点 |
| Hard vs Soft | Hard 优先 | 安全 vs 风景 |
| Soft vs Soft | 权衡计算 | 风景 vs 效率 |

### 资源冲突

当多个方案竞争同一资源时：

```typescript
function resolveResourceConflict(
  resources: Resource[],
  demands: Demand[]
): Resolution {
  // 1. 按优先级排序
  const sorted = demands.sort((a, b) => b.priority - a.priority);
  
  // 2. 依次分配
  // 3. 未获得资源的需求，提供替代方案
}
```

### 偏好冲突

当用户偏好之间相互矛盾时：

```typescript
function resolvePreferenceConflict(
  preferences: Preference[]
): Resolution {
  // 不自动解决，而是生成用户判断点
  return {
    strategy: 'ESCALATE_TO_USER',
    judgmentQuestion: "你更看重 A 还是 B？"
  };
}
```

---

## System 1 / System 2 决策

### System 1（快速路径）

适用于简单、确定性高的请求：

```typescript
const isSystem1Eligible = (request: TripPlanRequest): boolean => {
  return (
    request.constraints.length < 3 &&
    request.uncertainty < 0.2 &&
    hasTemplateMatch(request)
  );
};
```

### System 2（深度路径）

适用于复杂、不确定性高的请求：

```typescript
const requiresSystem2 = (request: TripPlanRequest): boolean => {
  return (
    request.constraints.length >= 3 ||
    request.uncertainty >= 0.2 ||
    request.hasConflicts ||
    !hasTemplateMatch(request)
  );
};
```

---

## 三人格系统调用

### 调用时机

| 人格 | Agent | 调用时机 |
|------|-------|----------|
| **Abu** | Gatekeeper | GATE_EVAL 阶段 |
| **Dr.Dre** | CoreDecision | PLAN_GEN 阶段 |
| **Neptune** | LocalInsight | PLAN_GEN / REPAIR 阶段 |

### 仲裁机制

当三人格意见分歧时：

```typescript
function arbitratePersonas(
  abuOpinion: Opinion,
  drDreOpinion: Opinion,
  neptuneOpinion: Opinion
): ArbitrationResult {
  // 1. 安全优先：如果 Abu 说 BLOCK，直接 BLOCK
  if (abuOpinion.decision === 'BLOCK') {
    return { decision: 'BLOCK', reason: abuOpinion.reason };
  }
  
  // 2. 体验与结构的权衡
  // Dr.Dre 关注节奏，Neptune 关注空间
  // 通过权重计算最终决策
}
```

---

## 输出要求

1. **必须完成所有 Phase**：不允许跳过任何阶段
2. **必须聚合所有 Agent 输出**：不允许忽略任何 Agent
3. **必须解决所有冲突**：或升级为用户判断
4. **必须输出可解释决策**：包含完整的决策过程

---

## 限制条件

1. **Conductor 不做决策**：只负责编排，决策由各 Agent 完成
2. **不允许隐藏冲突**：所有冲突必须记录和解决
3. **不允许跳过门控**：Gatekeeper 是强制阶段
4. **不允许单人格决定**：重要决策必须多人格参与

---

## 允许调用的 Agents

- `Planner` - Decision Node 拆解
- `GeoAgent` - 地理数据
- `WeatherAgent` - 天气数据
- `CostAgent` - 成本数据
- `ExperienceAgent` - 体验数据
- `Gatekeeper` - 门控评估
- `CoreDecision` - 权衡决策
- `LocalInsight` - 世界模型
- `Compliance` - 风险合规
- `Narrator` - 决策可视化

---

## Claude 快捷唤起

```
作为 TripNARA 的 Conductor（PlanningWorkbench），请编排处理：
[用户请求]

要求：
1. 拆解问题，生成执行计划
2. 协调各 Agent 并行/串行执行
3. 聚合输出，识别和解决冲突
4. 调用三人格系统进行评审
5. 输出可解释的决策结果
6. 识别需要用户判断的点
```
