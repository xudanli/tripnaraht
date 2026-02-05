# TripDetail - 决策回放 Agent

## 架构定位

**所属层级**：Decision Experience Layer（决策体验层）

TripDetail Agent 是 TripNARA 的"决策考古学家"，负责**决策回放、反事实模拟、历史风格建模**。核心能力是让用户理解"为什么会是这样"以及"如果当时选择不同会怎样"。

> **核心理念**：决策可回放、可反悔、可学习

**项目实现位置**：
- 服务：`src/agent/services/trip-detail-agent.service.ts`
- 控制器：`src/agent/trip-detail.controller.ts`

---

## AI-native 决策体验

### 传统 vs TripNARA

| 传统行程详情 | TripNARA 行程详情 |
|--------------|-------------------|
| 展示"结果" | 展示"决策过程" |
| 静态信息 | 可交互、可回放 |
| 无法修改历史 | 反事实模拟 |
| 一次性使用 | 学习用户风格 |

---

## 核心职责

### 1. 决策回放（Decision Replay）

像视频播放器一样回放决策过程：

```typescript
interface DecisionReplay {
  tripId: string;
  
  // 决策时间线
  timeline: Array<{
    timestamp: string;
    phase: 'INTAKE' | 'RESEARCH' | 'GATE' | 'DECISION' | 'VERIFY' | 'NARRATE';
    
    // 当时的状态
    snapshot: {
      worldState: WorldState;       // 当时的世界状态
      candidates: Candidate[];      // 当时的候选方案
      constraints: Constraint[];    // 当时的约束
      userInput: any;               // 当时的用户输入
    };
    
    // 当时的决策
    decision: {
      agent: AgentType;
      action: string;
      rationale: string;
      evidence: EvidenceRef[];
    };
    
    // 当时的输出
    output: any;
  }>;
  
  // 关键决策点
  keyDecisionPoints: Array<{
    timestamp: string;
    decision: string;
    alternatives: string[];
    whyThisChoice: string;
    impact: string;
  }>;
}
```

### 2. 反事实模拟（What-If Simulation）

模拟"如果当时选择不同会怎样"：

```typescript
interface WhatIfSimulation {
  // 原始决策
  originalDecision: {
    decisionId: string;
    choice: string;
    outcome: string;
  };
  
  // 反事实假设
  counterfactual: {
    alternativeChoice: string;
    simulatedOutcome: SimulatedOutcome;
  };
  
  // 对比分析
  comparison: {
    originalVsCounterfactual: Array<{
      dimension: string;
      original: string;
      counterfactual: string;
      difference: string;
    }>;
    
    // 总结
    summary: string;  // "如果当时选择 B，你会节省 2 小时但错过 XX 景点"
  };
}

interface SimulatedOutcome {
  // 模拟的行程
  simulatedItinerary: Itinerary;
  
  // 模拟的评分
  simulatedScores: Scores;
  
  // 模拟的风险
  simulatedRisks: Risk[];
  
  // 置信度
  confidence: number;  // 模拟的可靠程度
  
  // 不确定性说明
  uncertaintyNote: string;
}
```

### 3. 历史决策风格建模

从历史决策中学习用户的决策风格：

```typescript
interface DecisionStyleModel {
  userId: string;
  
  // 偏好推断
  inferredPreferences: {
    // 风险偏好
    riskProfile: 'RISK_SEEKING' | 'RISK_NEUTRAL' | 'RISK_AVERSE';
    riskEvidence: string[];
    
    // 体验 vs 效率
    experienceVsEfficiency: number;  // -1 (效率) to 1 (体验)
    evidence: string[];
    
    // 预算敏感度
    budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    evidence: string[];
    
    // 舒适度要求
    comfortRequirement: 'LOW' | 'MEDIUM' | 'HIGH';
    evidence: string[];
  };
  
  // 历史决策模式
  decisionPatterns: Array<{
    pattern: string;       // "总是选择有风景的路线"
    frequency: number;     // 发生频率
    confidence: number;    // 置信度
    examples: string[];    // 具体案例
  }>;
  
  // 用于未来决策的建议
  futureRecommendations: Array<{
    scenario: string;
    recommendation: string;
    basedOn: string;  // 基于哪些历史决策
  }>;
}
```

### 4. 证据展示（Evidence Display）

展示支撑决策的证据：

```typescript
interface EvidenceDisplay {
  decisionId: string;
  
  // 证据列表
  evidences: Array<{
    evidenceId: string;
    evidenceType: 'HARD' | 'SOFT' | 'ASSUMPTION';
    
    // 证据内容
    content: {
      source: string;       // 来源
      data: any;            // 数据
      timestamp: string;    // 时间
      reliability: number;  // 可靠性
    };
    
    // 证据对决策的影响
    impact: {
      affectedDecision: string;
      influenceWeight: number;
      explanation: string;
    };
  }>;
  
  // 证据链
  evidenceChain: Array<{
    step: number;
    evidence: string;
    inference: string;
    confidence: number;
  }>;
}
```

---

## 输入/输出 Schema

### 输入：TripDetailInput

```typescript
{
  trip_id: string;
  
  // 操作类型
  action: 'REPLAY' | 'WHAT_IF' | 'ANALYZE_STYLE' | 'SHOW_EVIDENCE' | 'GET_HEALTH';
  
  // 回放参数
  replayParams?: {
    startTime?: string;
    endTime?: string;
    phases?: string[];
    focusDecisions?: string[];
  };
  
  // 反事实参数
  whatIfParams?: {
    decisionId: string;
    alternativeChoice: string;
  };
  
  // 证据查询
  evidenceQuery?: {
    decisionId?: string;
    evidenceType?: string;
  };
}
```

### 输出：TripDetailOutput

```typescript
{
  trip_id: string;
  
  // 行程健康度
  trip_health?: {
    overall: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    breakdown: {
      feasibility: HealthStatus;
      timing: HealthStatus;
      budget: HealthStatus;
      experience: HealthStatus;
    };
    issues: Array<{
      category: string;
      severity: string;
      description: string;
      suggestion: string;
    }>;
  };
  
  // 决策回放
  replay?: DecisionReplay;
  
  // 反事实模拟
  what_if?: WhatIfSimulation;
  
  // 决策风格
  style_analysis?: DecisionStyleModel;
  
  // 证据展示
  evidence_display?: EvidenceDisplay;
  
  // 用户可操作点
  actionable_insights: Array<{
    insightId: string;
    insight: string;
    action: string;
    impact: string;
  }>;
}
```

---

## 决策回放设计

### 时间线视图

```
时间 ─────────────────────────────────────────────→

│ INTAKE      │ RESEARCH    │ GATE        │ DECISION   │
│             │             │             │            │
│ 用户输入    │ 天气数据    │ 硬门控      │ 方案评估   │
│ 约束识别    │ 交通数据    │ 软门控      │ 权衡分析   │
│ 方案框架    │ 成本数据    │ 修复建议    │ 最终选择   │
│             │             │             │            │
└─────────────┴─────────────┴─────────────┴────────────┘
              ↑                           ↑
           关键决策点 1               关键决策点 2
```

### 关键决策点标记

```typescript
interface KeyDecisionPoint {
  // 决策点识别
  id: string;
  timestamp: string;
  
  // 决策内容
  decision: {
    question: string;      // "选择哪条路线？"
    chosen: string;        // "路线 A"
    alternatives: string[]; // ["路线 B", "路线 C"]
  };
  
  // 决策理由
  rationale: {
    why: string;           // "因为风景更好"
    evidence: string[];    // 支撑证据
    confidence: number;    // 置信度
  };
  
  // 影响
  impact: {
    immediate: string;     // 直接影响
    downstream: string[];  // 后续影响
    tradeoff: string;      // 权衡代价
  };
  
  // 可交互
  interactive: {
    canRevert: boolean;    // 是否可以反悔
    canWhatIf: boolean;    // 是否可以模拟
    suggestedActions: string[];
  };
}
```

---

## 反事实模拟设计

### 模拟流程

```
用户选择一个决策点
        ↓
指定替代选择
        ↓
┌─────────────────────────────────────┐
│        反事实模拟引擎               │
│  - 重新执行后续决策流程              │
│  - 使用相同的世界状态               │
│  - 使用替代选择作为输入              │
└──────────────┬──────────────────────┘
               ↓
生成模拟结果
        ↓
对比分析
        ↓
展示给用户
```

### 模拟限制

```typescript
interface SimulationLimits {
  // 可模拟的范围
  simulatableDecisions: string[];  // 哪些决策可以模拟
  
  // 不可模拟的原因
  nonSimulatableReasons: Map<string, string>;
  
  // 模拟的置信度
  simulationConfidence: {
    factors: Array<{
      factor: string;
      impact: 'POSITIVE' | 'NEGATIVE';
      description: string;
    }>;
    overallConfidence: number;
    warning: string;
  };
}
```

---

## 风格建模设计

### 学习维度

| 维度 | 信号来源 | 推断方法 |
|------|----------|----------|
| 风险偏好 | 选择的方案风险档位 | 历史选择的风险分布 |
| 体验倾向 | 选择的景点类型 | 体验评分权重推断 |
| 预算敏感度 | 预算修改行为 | 成本弹性分析 |
| 舒适度要求 | 选择的住宿/交通档次 | 舒适度评分分析 |
| 时间偏好 | 节奏选择 | 时间分配模式 |

### 风格演化

```typescript
interface StyleEvolution {
  userId: string;
  
  // 风格变化时间线
  styleTimeline: Array<{
    period: string;
    dominantStyle: string;
    confidence: number;
  }>;
  
  // 最近变化
  recentChanges: Array<{
    dimension: string;
    from: string;
    to: string;
    evidence: string;
  }>;
  
  // 预测
  prediction: {
    futureStyle: string;
    confidence: number;
    basedOn: string;
  };
}
```

---

## 输出要求

1. **必须支持决策回放**：完整的决策时间线
2. **必须支持反事实模拟**：至少对关键决策点可模拟
3. **必须标注模拟置信度**：不能让用户误以为模拟是确定的
4. **必须保护隐私**：风格建模数据不外泄

---

## 限制条件

1. **反事实模拟不是预测**：必须明确标注是"模拟"不是"预测"
2. **不允许隐藏不确定性**：模拟结果必须带置信度
3. **不允许过度推断**：风格建模必须有足够证据
4. **不允许修改历史**：回放是只读的

---

## 允许调用的 Skills

- `replay.timeline` - 决策时间线生成
- `replay.snapshot` - 状态快照获取
- `whatif.simulate` - 反事实模拟
- `style.analyze` - 风格分析
- `style.predict` - 风格预测
- `evidence.chain` - 证据链构建

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **Execution** | 获取执行数据用于回放 |
| **Narrator** | 配合决策过程可视化 |
| **CoreDecision** | 获取决策日志 |
| **LocalInsight** | 反事实模拟时获取替代方案 |

---

## Claude 快捷唤起

```
作为 TripNARA 的 TripDetail Agent，请处理：
[行程 ID]
[操作：REPLAY / WHAT_IF / ANALYZE_STYLE / SHOW_EVIDENCE]

要求：
1. 如果是 REPLAY：生成完整的决策时间线
2. 如果是 WHAT_IF：模拟替代选择的结果，标注置信度
3. 如果是 ANALYZE_STYLE：分析用户的决策风格模式
4. 如果是 SHOW_EVIDENCE：展示决策的证据链
5. 所有输出必须可交互、可理解
```
