# AI-Native 决策系统接口文档

> 版本：1.1.0 | 更新日期：2026-02-03

本文档描述 AI-Native 决策系统中所有核心接口的定义、用途和使用场景。

---

## 目录

1. [Decision Node 接口](#1-decision-node-接口)
2. [Domain Agent 接口](#2-domain-agent-接口)
3. [Decision Replay 接口](#3-decision-replay-接口)
4. [RLHF Signal 接口](#4-rlhf-signal-接口)
5. [错误处理接口](#5-错误处理接口)
6. [API 端点汇总](#6-api-端点汇总)

---

## 1. Decision Node 接口

> 文件：`decision-node.interface.ts`

### 1.1 ConstraintType

约束类型枚举。

```typescript
type ConstraintType = 
  | 'REACHABILITY'      // 可达性约束
  | 'SAFETY_CRITICAL'   // 安全关键约束
  | 'PHYSICAL_LIMIT'    // 物理极限约束
  | 'LEGAL'             // 法律约束
  | 'DATA_CRITICAL'     // 数据关键约束
  | 'PREFERENCE'        // 偏好约束
  | 'COMFORT'           // 舒适度约束
  | 'EXPERIENCE'        // 体验约束
  | 'COST';             // 成本约束
```

**使用场景**：
- 定义行程规划中的硬性和软性约束
- Gate 评估时判断约束类型
- 约束冲突解决时确定优先级

---

### 1.2 Constraint

约束定义。

```typescript
interface Constraint {
  id: string;
  type: ConstraintType;
  hardness: 'HARD' | 'SOFT';
  description: string;
  value?: any;
  threshold?: any;
  violation_action: 'BLOCK' | 'ADJUST_REQUIRED' | 'NEED_USER_CONFIRM' | 'WARNING';
  evidence_refs?: string[];
}
```

**使用场景**：
- CoreDecision Agent 评估方案可行性
- Gatekeeper Agent 执行 Should-Exist Gate
- 用户违反约束时生成警告

**示例**：
```typescript
const safetyConstraint: Constraint = {
  id: 'c-001',
  type: 'SAFETY_CRITICAL',
  hardness: 'HARD',
  description: 'F-Road 需要 4x4 车辆',
  value: { vehicle_type: '4x4' },
  violation_action: 'BLOCK',
  evidence_refs: ['ev-road-001']
};
```

---

### 1.3 TradeoffModel

权衡模型。

```typescript
interface TradeoffModel {
  dimension: 'TIME' | 'COST' | 'EXPERIENCE' | 'RISK';
  weight: number;           // 权重 (0-1)
  current_value: number;    // 当前值
  optimal_value: number;    // 最优值
  acceptable_range: { min: number; max: number };
  loss_function: string;    // 损失函数描述
}
```

**使用场景**：
- CoreDecision Agent 计算多方案权衡
- 用户调整偏好后重新计算方案得分
- What-If 模拟时评估不同权重的影响

**示例**：
```typescript
const timeTradeoff: TradeoffModel = {
  dimension: 'TIME',
  weight: 0.3,
  current_value: 8,      // 8 小时
  optimal_value: 6,      // 最优 6 小时
  acceptable_range: { min: 5, max: 12 },
  loss_function: 'linear: 10 points per hour over optimal'
};
```

---

### 1.4 UncertaintyProfile

不确定性概况。

```typescript
interface UncertaintyProfile {
  confidence: number;       // 置信度 (0-1)
  data_quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  uncertainty_sources: Array<{
    source: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    mitigation?: string;
  }>;
  risk_distribution?: {
    optimistic: number;
    expected: number;
    pessimistic: number;
  };
}
```

**使用场景**：
- 向用户展示决策的可靠性
- 识别需要用户确认的高不确定性决策
- Narrator Agent 生成风险提示

**示例**：
```typescript
const weatherUncertainty: UncertaintyProfile = {
  confidence: 0.65,
  data_quality: 'MEDIUM',
  uncertainty_sources: [
    { source: 'Weather forecast 7+ days', impact: 'HIGH', mitigation: 'Check closer to departure' },
    { source: 'Road conditions', impact: 'MEDIUM', mitigation: 'Monitor road.is' }
  ],
  risk_distribution: { optimistic: 2, expected: 4, pessimistic: 8 }
};
```

---

### 1.5 DecisionOption

决策选项。

```typescript
interface DecisionOption {
  id: string;
  name: string;
  description: string;
  tradeoffs: {
    time: { value: number; unit: string; impact: string };
    cost: { value: number; currency: string; impact: string };
    experience: { value: number; description: string };
    risk: { value: number; factors: string[] };
  };
  uncertainty: UncertaintyProfile;
  evidence_refs: string[];
  constraint_satisfaction: Array<{
    constraint_id: string;
    satisfied: boolean;
    violation_severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    repair_suggestion?: string;
  }>;
  score: number;
  ranking?: number;
}
```

**使用场景**：
- CoreDecision Agent 生成候选方案
- Narrator Agent 展示方案比较
- 用户选择方案时的数据源

---

### 1.6 DecisionNode

决策节点（核心接口）。

```typescript
interface DecisionNode {
  id: string;
  type: 'ROOT' | 'BRANCH' | 'LEAF';
  name: string;
  description: string;
  context: {
    destination?: string;
    date_range?: { start: string; end: string };
    travelers?: { count: number; profile: string };
    current_phase: string;
    parent_node_id?: string;
  };
  constraints: { hard: Constraint[]; soft: Constraint[] };
  preferences: {
    pace: 'SLOW' | 'BALANCED' | 'FAST';
    priority: TradeoffDimension;
    risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    custom?: Record<string, any>;
  };
  options: DecisionOption[];
  tradeoff_model: TradeoffModel[];
  overall_uncertainty: UncertaintyProfile;
  decision?: {
    selected_option_id: string;
    reasoning: string;
    alternatives_considered: string[];
    user_judgment_required?: Array<{
      question: string;
      options: string[];
      default?: string;
      impact: string;
    }>;
  };
  children?: DecisionNode[];
  metadata: {
    created_at: string;
    updated_at: string;
    decided_at?: string;
    decided_by?: 'SYSTEM' | 'USER';
    version: number;
  };
}
```

**使用场景**：
- ClaudeOrchestrator 构建决策树
- Decision Replay 保存和回放决策
- 多步骤决策的层级管理

---

### 1.7 DecisionOutput

决策输出（核心接口）。

```typescript
interface DecisionOutput {
  decision_node: DecisionNode;
  ranked_plans: Array<{
    plan: DecisionOption;
    rank: number;
    uncertainty: UncertaintyProfile;
    tradeoffs: Record<TradeoffDimension, { value: number; impact: string }>;
    what_you_pay_for: string;
    what_you_get: string;
  }>;
  comparison: ComparisonMatrix;
  user_judgment_required: Array<{
    question: string;
    context: string;
    options: Array<{ id: string; label: string; impact: string }>;
    recommendation?: string;
  }>;
  evidence_summary: {
    total_evidence: number;
    verified: number;
    unverified: number;
    assumptions: number;
  };
}
```

**使用场景**：
- CoreDecision Agent 的主要输出
- Narrator Agent 生成用户故事
- 前端展示决策比较界面

---

## 2. Domain Agent 接口

> 文件：`sub-agent.interface.ts`

### 2.1 DataQuality（新增）

数据质量标注。

```typescript
interface DataQuality {
  source_type: 'REALTIME_API' | 'CACHED' | 'HISTORICAL' | 'ESTIMATED' | 'MOCK';
  freshness_seconds: number;
  confidence: number;        // 0-1
  coverage: number;          // 0-1
  retrieved_at: string;
  expires_at?: string;
  fallback_info?: {
    original_source: string;
    fallback_reason: string;
    quality_impact: 'NONE' | 'MINOR' | 'MODERATE' | 'SIGNIFICANT';
  };
}
```

**使用场景**：
- 所有 Domain Agent 返回都包含此字段
- Narrator Agent 生成数据可靠性提示
- 系统监控数据质量

**示例**：
```typescript
// 实时 API 数据
const realtimeQuality: DataQuality = {
  source_type: 'REALTIME_API',
  freshness_seconds: 0,
  confidence: 0.95,
  coverage: 1.0,
  retrieved_at: '2026-02-03T10:00:00Z',
  expires_at: '2026-02-03T11:00:00Z'
};

// 降级数据
const fallbackQuality: DataQuality = {
  source_type: 'ESTIMATED',
  freshness_seconds: 0,
  confidence: 0.5,
  coverage: 0.7,
  retrieved_at: '2026-02-03T10:00:00Z',
  fallback_info: {
    original_source: 'WeatherAPI',
    fallback_reason: 'API timeout',
    quality_impact: 'MODERATE'
  }
};
```

---

### 2.2 GeoAgent

地理与路线分析。

| 方法 | 返回类型 | 使用场景 |
|------|----------|----------|
| `analyzeTerrain(route)` | 地形分析 + `data_quality` | 评估路线难度、识别高海拔风险 |
| `checkRouteFeasibility(origin, dest, mode)` | 可行性 + `data_quality` | Gate 评估可达性、阻塞因素识别 |
| `findNearbyPOIs(center, radius, categories)` | POI 列表 + `data_quality` | 寻找备选景点、应急设施定位 |

---

### 2.3 WeatherAgent

气象与封路分析。

| 方法 | 返回类型 | 使用场景 |
|------|----------|----------|
| `getForecast(location, dateRange)` | 天气预报 + `data_quality` | 每日活动适宜性评估 |
| `assessRoadClosureProbability(route, date)` | 封路概率 + `data_quality` | F-Road 可通行性判断 |
| `quantifyWeatherRisk(location, date, activity)` | 风险量化 + `data_quality` | 户外活动风险提示 |

---

### 2.4 CostAgent

价格与预算分析。

| 方法 | 返回类型 | 使用场景 |
|------|----------|----------|
| `estimateTripCost(dest, dateRange, travelers)` | 成本估算 + `data_quality` | 预算规划、费用分解 |
| `analyzePriceCurve(service, dest, dateRange)` | 价格趋势 + `data_quality` | 最佳预订时机建议 |
| `optimizeBudget(budget, requirements)` | 预算分配 + `data_quality` | 预算优化建议 |

---

### 2.5 ExperienceAgent

体验与节奏分析。

| 方法 | 返回类型 | 使用场景 |
|------|----------|----------|
| `analyzeExperienceDensity(itinerary)` | 体验密度 + `data_quality` | 行程丰富度评估 |
| `predictFatigue(itinerary, userProfile)` | 疲劳预测 + `data_quality` | 过度疲劳预警 |
| `optimizePace(itinerary, preferences)` | 节奏优化 + `data_quality` | 节奏调整建议 |
| `assessHumanExecutability(itinerary, profile)` | 可执行性 + `data_quality` | 人体极限检查 |

---

## 3. Decision Replay 接口

> 文件：`decision-replay.service.ts`

### 3.1 DecisionSnapshot

决策快照。

```typescript
interface DecisionSnapshot {
  snapshot_id: string;
  timestamp: string;
  state: OrchestratorState;
  decision_node?: DecisionNode;
  decision_output?: DecisionOutput;
  metadata: {
    step: string;
    actor: string;
    trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT';
  };
}
```

**使用场景**：
- 每个决策点自动创建快照
- 用户回退到历史决策点
- 决策审计和追溯

---

### 3.2 DecisionTimeline

决策时间线。

```typescript
interface DecisionTimeline {
  trip_run_id: string;
  created_at: string;
  snapshots: DecisionSnapshot[];
  key_decision_points: Array<{
    snapshot_id: string;
    description: string;
    importance: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  total_duration_ms: number;
}
```

**使用场景**：
- 可视化决策过程
- 分析决策耗时瓶颈
- 用户理解 AI 决策路径

---

### 3.3 WhatIfInput / WhatIfResult

What-If 模拟。

```typescript
interface WhatIfInput {
  base_snapshot_id: string;
  changes: Array<{
    type: 'PREFERENCE_CHANGE' | 'CONSTRAINT_CHANGE' | 'OPTION_CHANGE' | 'DATE_CHANGE';
    field: string;
    original_value: any;
    new_value: any;
  }>;
}

interface WhatIfResult {
  original_snapshot_id: string;
  simulated_output: DecisionOutput;
  comparison: {
    score_change: number;
    ranking_changes: Array<{ option_id: string; old_rank: number; new_rank: number }>;
    tradeoff_changes: Record<TradeoffDimension, { old: number; new: number; change: number }>;
  };
  insights: string[];
}
```

**使用场景**：
- 用户探索"如果..."场景
- 偏好变更的影响预览
- 教育用户理解权衡

---

### 3.4 DecisionStyleModel

用户决策风格。

```typescript
interface DecisionStyleModel {
  user_id?: string;
  inferred_preferences: {
    pace: 'SLOW' | 'BALANCED' | 'FAST';
    priority: TradeoffDimension;
    risk_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    budget_sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  patterns: Array<{
    pattern: string;
    frequency: number;
    confidence: number;
  }>;
  learning_signals: Array<{
    signal_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION';
    context: string;
    timestamp: string;
  }>;
}
```

**使用场景**：
- 个性化默认偏好
- 推荐优化
- 用户画像构建

---

## 4. RLHF Signal 接口

> 文件：`rlhf-signal-collector.service.ts`

### 4.1 BehaviorSignal

行为信号。

```typescript
interface BehaviorSignal {
  signal_id: string;
  trip_run_id: string;
  user_id?: string;
  signal_type: 'VIEW' | 'CLICK' | 'HOVER' | 'SCROLL' | 'TIME_SPENT' | 'EXPAND' | 'COLLAPSE';
  target: {
    element_type: 'PLAN' | 'OPTION' | 'TRADEOFF' | 'EVIDENCE' | 'WARNING';
    element_id: string;
    element_context?: string;
  };
  metadata?: {
    duration_ms?: number;
    scroll_depth?: number;
    viewport_visible?: boolean;
  };
  timestamp: string;
}
```

**使用场景**：
- 追踪用户关注点
- 分析方案吸引力
- 优化信息展示顺序

---

### 4.2 ExecutionSignal

执行信号。

```typescript
interface ExecutionSignal {
  signal_id: string;
  trip_run_id: string;
  signal_type: 'START' | 'DEVIATION' | 'SKIP' | 'DELAY' | 'EARLY' | 'COMPLETE' | 'ABORT';
  context: {
    planned_item_id: string;
    planned_time?: string;
    actual_time?: string;
    deviation_minutes?: number;
    reason?: string;
  };
  timestamp: string;
}
```

**使用场景**：
- 追踪行程执行偏差
- 评估规划准确性
- 识别常见跳过项目

---

### 4.3 FeedbackSignal

反馈信号。

```typescript
interface FeedbackSignal {
  signal_id: string;
  trip_run_id: string;
  user_id?: string;
  decision_point_id: string;
  feedback_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION' | 'RATING' | 'COMMENT';
  value: {
    rating?: number;           // 1-5
    choice?: string;
    modification?: any;
    comment?: string;
  };
  context: Record<string, any>;
  timestamp: string;
}
```

**使用场景**：
- 收集用户满意度
- 学习用户偏好
- 决策质量评估

---

### 4.4 DecisionQualityAssessment

决策质量评估。

```typescript
interface DecisionQualityAssessment {
  trip_run_id: string;
  decision_point_id: string;
  assessed_at: string;
  prediction_accuracy: number;    // 0-1
  user_satisfaction: number;      // 0-1
  execution_adherence: number;    // 0-1
  overall_quality: number;        // 0-1
  factors: Array<{
    factor: string;
    contribution: number;
    direction: 'POSITIVE' | 'NEGATIVE';
  }>;
  improvement_signals: Array<{
    area: string;
    suggestion: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}
```

**使用场景**：
- 决策系统质量监控
- 识别改进领域
- 模型调优信号

---

### 4.5 LearningSignal

学习信号。

```typescript
interface LearningSignal {
  signal_id: string;
  trip_run_id: string;
  signal_category: 'PREFERENCE' | 'CONSTRAINT' | 'TRADEOFF' | 'RISK' | 'BEHAVIOR';
  signal_strength: number;        // 0-1
  observation: {
    what_happened: string;
    context: Record<string, any>;
    source_signals: string[];
  };
  learning_target: {
    model_component: string;
    adjustment_type: 'WEIGHT' | 'THRESHOLD' | 'RULE' | 'DEFAULT';
    adjustment_magnitude: number;
  };
}
```

**使用场景**：
- 模型持续学习
- 偏好权重调整
- 规则阈值优化

---

## 5. 错误处理接口

> 文件：`domain-agent-error-handler.service.ts`

### 5.1 DomainAgentErrorType

```typescript
enum DomainAgentErrorType {
  DATA_SOURCE_UNAVAILABLE = 'DATA_SOURCE_UNAVAILABLE',
  DATA_SOURCE_TIMEOUT = 'DATA_SOURCE_TIMEOUT',
  DATA_FORMAT_ERROR = 'DATA_FORMAT_ERROR',
  DATA_VALIDATION_ERROR = 'DATA_VALIDATION_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
```

---

### 5.2 FallbackStrategy

```typescript
interface FallbackStrategy {
  useCache: boolean;
  maxCacheAge?: number;
  useDefaults: boolean;
  defaults?: any;
  retry: boolean;
  retryCount?: number;
  retryDelay?: number;
}
```

**使用场景**：
- Domain Agent 错误恢复
- 服务降级策略
- 自动重试机制

---

### 5.3 ErrorHandlingResult

```typescript
interface ErrorHandlingResult<T> {
  recovered: boolean;
  data?: T;
  data_quality: DataQuality;
  evidence: EvidenceRef;
  shouldWarnUser: boolean;
  userWarning?: string;
}
```

**使用场景**：
- 错误恢复结果封装
- 用户警告生成
- 数据质量降级标记

---

## 6. API 端点汇总

### 6.1 Decision Replay API

| 方法 | 端点 | 使用场景 |
|------|------|----------|
| GET | `/api/v1/decision-replay/timeline/:tripRunId` | 获取完整决策历史 |
| GET | `/api/v1/decision-replay/timeline/:tripRunId/summary` | 获取决策概要 |
| GET | `/api/v1/decision-replay/snapshot/:tripRunId/:snapshotId` | 查看特定决策点 |
| GET | `/api/v1/decision-replay/snapshot/:tripRunId/latest` | 获取最新状态 |
| POST | `/api/v1/decision-replay/replay/:tripRunId/:snapshotId` | 回退到历史决策 |
| GET | `/api/v1/decision-replay/diff/:tripRunId` | 比较两个快照 |
| POST | `/api/v1/decision-replay/what-if` | What-If 模拟 |
| POST | `/api/v1/decision-replay/counterfactual/:tripRunId` | 生成反事实问题 |
| GET | `/api/v1/decision-replay/style/:userId` | 获取用户风格 |
| GET | `/api/v1/decision-replay/style/:userId/preferences` | 推断偏好 |
| POST | `/api/v1/decision-replay/style/:userId/signal` | 记录学习信号 |
| POST | `/api/v1/decision-replay/judgment/:tripRunId` | 提交用户判断 |
| GET | `/api/v1/decision-replay/judgment/:tripRunId/pending` | 获取待处理判断 |

### 6.2 RLHF Signal API

| 方法 | 端点 | 使用场景 |
|------|------|----------|
| POST | `/api/v1/rlhf/behavior` | 记录通用行为 |
| POST | `/api/v1/rlhf/behavior/view` | 记录查看时间 |
| POST | `/api/v1/rlhf/behavior/interaction` | 记录交互操作 |
| POST | `/api/v1/rlhf/execution` | 记录执行信号 |
| POST | `/api/v1/rlhf/execution/deviation` | 记录偏差 |
| POST | `/api/v1/rlhf/execution/skip` | 记录跳过 |
| POST | `/api/v1/rlhf/feedback` | 记录通用反馈 |
| POST | `/api/v1/rlhf/feedback/accept` | 记录接受 |
| POST | `/api/v1/rlhf/feedback/reject` | 记录拒绝 |
| POST | `/api/v1/rlhf/feedback/rate` | 记录评分 |
| POST | `/api/v1/rlhf/quality/:tripRunId/:decisionPointId` | 评估质量 |
| GET | `/api/v1/rlhf/learning/:tripRunId` | 生成学习信号 |
| GET | `/api/v1/rlhf/summary/:tripRunId` | 信号统计 |

---

## 附录：接口关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ClaudeOrchestrator                           │
│                              │                                      │
│         ┌────────────────────┼────────────────────┐                 │
│         │                    │                    │                 │
│         ▼                    ▼                    ▼                 │
│   ┌──────────┐        ┌──────────┐         ┌──────────┐            │
│   │ GeoAgent │        │ Weather  │         │ Cost     │            │
│   │          │        │ Agent    │         │ Agent    │            │
│   └────┬─────┘        └────┬─────┘         └────┬─────┘            │
│        │                   │                    │                   │
│        └───────────────────┼────────────────────┘                   │
│                            │                                        │
│                            ▼                                        │
│              ┌─────────────────────────┐                           │
│              │    CoreDecision Agent   │                           │
│              │    ┌─────────────────┐  │                           │
│              │    │  DecisionNode   │  │                           │
│              │    │  DecisionOutput │  │                           │
│              │    └─────────────────┘  │                           │
│              └───────────┬─────────────┘                           │
│                          │                                         │
│         ┌────────────────┼────────────────┐                        │
│         │                │                │                        │
│         ▼                ▼                ▼                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │  Decision   │  │   RLHF      │  │   Narrator  │                │
│  │  Replay     │  │   Signal    │  │   Agent     │                │
│  │  Service    │  │   Collector │  │             │                │
│  └─────────────┘  └─────────────┘  └─────────────┘                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.1.0 | 2026-02-03 | 添加 DataQuality、用户判断点 API、错误处理接口 |
| 1.0.0 | 2026-02-03 | 初始版本 |
