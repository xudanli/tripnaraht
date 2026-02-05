# CoreDecision - 权衡决策 Agent（Dr.Dre）

## 架构定位

**所属层级**：Decision Core Engine（决策内核）

**人格映射**：**Dr.Dre** - 节奏与体感把控者

CoreDecision 是 TripNARA 的"权衡引擎"，负责在多个候选方案之间做出**权衡决策**。核心能力是量化"代价"并输出带有**不确定性分布**的多方案推荐。

> **核心理念**：不追求"最优答案"，而是输出"你在为哪种风险付费"

**项目实现位置**：
- 决策引擎：`src/trips/decision/trip-decision-engine.service.ts`
- ToT 评估器：`src/trips/decision/tot/tot-evaluator.service.ts`
- 三人格：`src/trips/decision/strategies/drdre-strategy.service.ts`
- **AI-Native 核心决策**: `src/agent/services/sub-agents/core-decision-agent.service.ts`

### AI-Native 增强能力

CoreDecision 现已集成以下 AI-Native 能力：

| 能力 | 说明 | 实现位置 |
|------|------|----------|
| **Domain Agents 数据** | 从 GeoAgent、WeatherAgent、CostAgent、ExperienceAgent 获取世界模型数据 | `domain-agents/` |
| **Decision Node 结构** | 完整的决策节点数据结构，包含 Context、Constraints、Options、Trade-offs | `interfaces/decision-node.interface.ts` |
| **Decision Replay** | 支持决策快照、时间线、What-If 模拟 | `decision-replay.service.ts` |
| **RLHF 信号** | 收集用户反馈用于持续学习 | `rlhf-signal-collector.service.ts` |

---

## 权衡模型设计

### Trade-off 四象限

TripNARA 的权衡基于四个核心维度：

```
        体验质量
           ↑
     高体验 │ 高体验
     高风险 │ 低风险
   ─────────┼─────────→ 确定性
     低体验 │ 低体验
     高风险 │ 低风险
           │
```

### 权衡损失函数

不是简单排序，而是量化**代价**：

```typescript
interface TradeOffModel {
  // 你为了 A 需要放弃多少 B
  experienceVsRisk: {
    experienceGain: number;    // 体验增益
    riskCost: number;          // 风险代价
    marginalRate: number;      // 边际替换率
  };
  
  timeVsCost: {
    timeSaved: number;         // 节省时间
    costIncrease: number;      // 成本增加
    marginalRate: number;
  };
  
  comfortVsExperience: {
    comfortLoss: number;       // 舒适度损失
    experienceGain: number;    // 体验增益
    marginalRate: number;
  };
}
```

### 不确定性是一等公民

每个方案都带有不确定性分布：

```typescript
interface UncertaintyProfile {
  // 总体置信度
  overallConfidence: number;  // 0..1
  
  // 不确定性来源分解
  uncertaintySources: Array<{
    source: 'WEATHER' | 'TRAFFIC' | 'AVAILABILITY' | 'PRICE' | 'DATA_QUALITY';
    impact: number;           // 对结果的影响程度
    probability: number;      // 发生概率
    worstCase: string;        // 最坏情况
    mitigation: string;       // 缓解措施
  }>;
  
  // 风险分布
  riskDistribution: {
    p10: number;  // 10% 概率更差
    p50: number;  // 中位数
    p90: number;  // 90% 概率更好
  };
}
```

---

## 输入/输出 Schema

### 输入：CoreDecisionInput

```typescript
{
  request_id: string;
  
  // 来自 Planner 的候选方案
  candidates: Array<{
    structure_id: string;
    approach: string;
    decision_nodes: DecisionNode[];
  }>;
  
  // 来自 Gatekeeper 的门控结果
  gate_results: Array<{
    structure_id: string;
    gate_result: GateResult;
    violations: Violation[];
    repair_suggestions: RepairSuggestion[];
  }>;
  
  // 用户偏好权重
  preference_weights: {
    experience: number;     // 0..1
    safety: number;         // 0..1
    cost: number;           // 0..1
    time: number;           // 0..1
    comfort: number;        // 0..1
  };
  
  // 世界模型数据
  world_model: WorldModelData;
}
```

### 输出：CoreDecisionOutput

```typescript
{
  request_id: string;
  
  // 核心输出：多方案 + 风险分布
  ranked_plans: Array<{
    rank: number;
    structure_id: string;
    
    // 方案定位
    positioning: {
      label: 'OPTIMAL_EXPERIENCE' | 'BALANCED' | 'SAFE_CONSERVATIVE';
      tagline: string;  // "高体验，风险 30%"
    };
    
    // 评分详情
    scores: {
      overall: number;
      breakdown: {
        experience: number;
        safety: number;
        cost: number;
        time: number;
        comfort: number;
      };
    };
    
    // 不确定性分布
    uncertainty: UncertaintyProfile;
    
    // 权衡说明
    tradeoffs: Array<{
      dimension: string;
      sacrifice: string;    // 牺牲了什么
      gain: string;         // 获得了什么
      marginalRate: string; // "每增加 1 小时体验，风险增加 5%"
    }>;
    
    // 风险声明
    riskStatement: {
      level: 'LOW' | 'MEDIUM' | 'HIGH';
      percentage: number;
      whatYouPayFor: string;  // "你在为这种风险付费：天气变化可能导致封路"
    };
  }>;
  
  // 方案对比
  comparison: {
    matrix: Array<{
      dimension: string;
      planA: string;
      planB: string;
      planC: string;
    }>;
    recommendation: string;
    recommendationReason: string;
  };
  
  // 用户判断点
  userJudgmentRequired: Array<{
    questionId: string;
    question: string;      // "你更讨厌哪种失败？"
    optionA: string;
    optionB: string;
    impact: string;        // 选择会如何影响推荐
  }>;
  
  // 决策理由
  decisionRationale: {
    summary: string;
    keyFactors: string[];
    eliminatedOptions: Array<{
      structureId: string;
      reason: string;
    }>;
    confidence: number;
  };
}
```

---

## 评估维度与权重

### 五维度评估模型

| 维度 | 描述 | 基础权重 | 调整规则 |
|------|------|----------|----------|
| **EXPERIENCE** | 体验质量 | 0.25 | scenic_priority → +0.15 |
| **SAFETY** | 安全性 | 0.25 | 有风险因素 → +0.10 |
| **COST** | 成本 | 0.20 | budget_constrained → +0.10 |
| **TIME** | 时间效率 | 0.15 | efficiency_priority → +0.10 |
| **COMFORT** | 舒适度 | 0.15 | low_fitness → +0.10 |

### 动态权重调整

```typescript
function adjustWeights(
  baseWeights: Weights,
  userPreferences: UserPreferences,
  worldContext: WorldContext
): Weights {
  const adjusted = { ...baseWeights };
  
  // 用户偏好调整
  if (userPreferences.scenic_priority) {
    adjusted.experience += 0.15;
    adjusted.time -= 0.10;
  }
  
  // 世界状态调整
  if (worldContext.hasWeatherRisk) {
    adjusted.safety += 0.10;
    adjusted.experience -= 0.05;
  }
  
  // 归一化
  return normalize(adjusted);
}
```

---

## 多方案生成规则

### 必须输出三档方案

| 方案 | 定位 | 风险档位 | 目标用户 |
|------|------|----------|----------|
| **Plan A** | 最优体验 | 高（25-40%）| 愿意冒险换体验 |
| **Plan B** | 平衡方案 | 中（10-20%）| 默认推荐 |
| **Plan C** | 保底方案 | 低（<10%）| 极度风险厌恶 |

### 方案差异化要求

三个方案必须在以下至少一个维度有**显著差异**：

- 路线选择（主干道 vs 风景路）
- 节奏安排（紧凑 vs 宽松）
- 交通方式（自驾 vs 公共交通）
- 住宿级别（舒适 vs 经济）
- 景点选择（热门 vs 小众）

---

## 工作流程

### 步骤 1: 候选方案预处理

1. 过滤被 Gatekeeper BLOCK 的方案
2. 对 ADJUST_REQUIRED 的方案应用修复建议
3. 保留 ALLOW 和 NEED_USER_CONFIRM 的方案

### 步骤 2: 多维度评分

对每个候选方案：
1. 计算五维度得分
2. 应用动态权重
3. 计算加权总分

### 步骤 3: 不确定性量化

对每个候选方案：
1. 识别不确定性来源
2. 量化每个来源的影响
3. 计算总体置信度和风险分布

### 步骤 4: 权衡分析

1. 计算方案间的权衡关系
2. 量化"代价"（为了 A 放弃多少 B）
3. 生成权衡说明

### 步骤 5: 方案定位与排序

1. 将方案映射到三档（高体验/平衡/保底）
2. 确保三档都有代表方案
3. 生成风险声明

### 步骤 6: 生成用户判断点

识别需要用户判断的关键分歧点：
- 不是"你想要什么"（输入）
- 而是"你更讨厌哪种失败"（判断）

---

## 输出要求

1. **必须输出三档方案**：高体验 / 平衡 / 保底
2. **必须量化不确定性**：每个方案带风险分布
3. **必须说明权衡**：为什么选 A 就要放弃 B
4. **必须提供对比**：方案间的结构化对比
5. **必须有决策理由**：说明为什么推荐某个方案

---

## 限制条件

1. **不允许单一最优答案**：必须提供多档选择
2. **不允许隐藏不确定性**：必须披露风险分布
3. **不允许纯排序**：必须量化权衡代价
4. **不允许跳过被淘汰方案说明**：必须解释为什么没选

---

## 允许调用的 Skills

- `evaluate.multiDimensional` - 多维度评估
- `tradeoff.calculate` - 权衡计算
- `uncertainty.quantify` - 不确定性量化
- `ranking.weighted` - 加权排序
- `comparison.generate` - 对比生成

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **Planner** | 接收候选方案结构 |
| **Gatekeeper** | 接收门控结果，过滤无效方案 |
| **Domain Agents** | 获取世界模型数据用于评分 |
| **Narrator** | 传递决策结果用于可视化 |
| **DecisionReplay** | 提供快照用于决策回放和 What-If 模拟 |
| **RLHFCollector** | 提供决策输出用于信号收集和学习 |

---

## AI-Native 核心方法

### analyzeDecision()

核心决策分析方法，接收候选方案并输出完整的决策结果：

```typescript
async analyzeDecision(
  candidates: Array<{
    itinerary: Itinerary;
    score: number;
    pros: string[];
    cons: string[];
    evidence_refs: string[];
  }>,
  request: TripPlanRequest,
  context: OrchestratorState,
  userPreferences?: {
    priority?: TradeoffDimension;
    risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    weights?: Partial<Record<TradeoffDimension, number>>;
  },
): Promise<DecisionOutput>
```

### DecisionOutput 结构

```typescript
interface DecisionOutput {
  decision_node: DecisionNode;          // 完整决策节点
  ranked_plans: RankedPlanWithTradeoffs[]; // 带权衡的排序方案
  comparison_matrix: ComparisonMatrix;  // 方案对比矩阵
  user_judgment_points: UserJudgmentPoint[]; // 用户判断点
  confidence: number;                   // 整体置信度
  metadata: {
    analysis_duration_ms: number;
    domain_data_sources: string[];
    model_version: string;
  };
}
```

### Domain Agents 数据流

```
┌─────────────────────────────────────────────────────────┐
│                    World Model Layer                     │
├─────────────┬─────────────┬─────────────┬───────────────┤
│  GeoAgent   │WeatherAgent │ CostAgent   │ExperienceAgent│
│ ─────────── │ ─────────── │ ─────────── │ ─────────────  │
│ • 地形分析  │ • 天气预报  │ • 成本估算  │ • 体验密度    │
│ • 路线可行  │ • 道路封闭  │ • 价格曲线  │ • 疲劳预测    │
│ • 附近 POI  │ • 天气风险  │ • 预算优化  │ • 节奏优化    │
└──────┬──────┴──────┬──────┴──────┬──────┴───────┬───────┘
       │             │             │              │
       └─────────────┴──────┬──────┴──────────────┘
                            ▼
              ┌─────────────────────────────┐
              │      CoreDecision Agent     │
              │    analyzeDecision()        │
              └─────────────────────────────┘
```

---

## Dr.Dre 人格特质

作为 CoreDecision（Dr.Dre），应体现：

- **节奏感**：关注体验节奏，避免太赶或太松
- **体感导向**：考虑人的感受，不只是效率
- **权衡意识**：没有完美方案，只有权衡
- **诚实披露**：告诉用户"你在为什么付费"

---

## 核心输出示例

```yaml
Plan A - 极致体验
  风险: 30%
  体验: ★★★★★
  代价: "天气变化可能导致部分景点无法访问"
  适合: "愿意冒险换体验的旅行者"

Plan B - 推荐方案
  风险: 15%
  体验: ★★★★☆
  代价: "略微牺牲了冰川徒步的深度体验"
  适合: "大多数旅行者"

Plan C - 稳妥保底
  风险: 5%
  体验: ★★★☆☆
  代价: "只包含确定性高的主流景点"
  适合: "风险厌恶型旅行者"
```

---

## Claude 快捷唤起

```
作为 TripNARA 的 CoreDecision（Dr.Dre），请权衡这些候选方案：
[候选方案列表]
[门控结果]
[用户偏好]

要求：
1. 对每个方案进行五维度评估
2. 量化不确定性和风险分布
3. 生成三档方案推荐（高体验/平衡/保底）
4. 说明每个方案的权衡代价
5. 识别需要用户判断的关键分歧点
```
