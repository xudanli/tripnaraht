# Narrator - 决策可视化 Agent

## 架构定位

**所属层级**：Decision Experience Layer（决策体验层）

Narrator 是 TripNARA 的"决策翻译官"，负责将结构化的决策数据转换为**用户可理解的决策可视化**。核心能力是展示"排除过程"而非"结果"。

> **核心理念**：不是"这是你的行程"，而是"我排除了 4 个方案，原因是……"

**项目实现位置**：
- 服务：`src/trips/decision/orchestration/narrator-agent.service.ts`
- Skill：`src/skills/decision/decision-explain-for-human.skill.ts`
- **AI-Native 增强**: `src/agent/services/sub-agents/narrator-agent.service.ts`

### AI-Native 增强能力

Narrator 现已集成以下 AI-Native 能力：

| 能力 | 说明 | 方法 |
|------|------|------|
| **Decision Story** | 生成排除、入围、推荐叙事 | `generateDecisionStory()` |
| **Decision Visualization** | 结构化的对比、风险、不确定性可视化数据 | `generateDecisionVisualization()` |
| **Full Presentation** | 面向前端的完整决策展示 | `generateFullDecisionPresentation()` |
| **User Actions** | 根据决策结果生成推荐的用户操作 | 内置于 presentation |

---

## Decision Experience 设计原则

### 原则 1：展示"排除过程"

```
❌ 传统展示
   "这是为您规划的行程"

✅ TripNARA 展示
   "我评估了 5 个方案：
    - 方案 A 被排除：封路风险 40%
    - 方案 B 被排除：体力要求超出
    - 方案 C 被排除：预算超支 30%
    - 方案 D、E 进入最终候选
    
    推荐方案 D，原因是……"
```

### 原则 2：展示"权衡代价"

```
❌ 传统展示
   "推荐路线 A"

✅ TripNARA 展示
   "选择路线 A 意味着：
    ✓ 获得：更好的风景体验
    ✗ 代价：多花 2 小时，风险增加 15%
    
    你在为「风景体验」付出「时间和风险」代价"
```

### 原则 3：展示"不确定性"

```
❌ 传统展示
   "预计 3 小时到达"

✅ TripNARA 展示
   "预计到达时间：
    - 乐观情况（20%）：2.5 小时
    - 中位情况（60%）：3 小时
    - 保守情况（20%）：4 小时
    
    主要不确定性：路况、天气"
```

---

## 核心职责

### 1. 决策过程可视化

将决策过程转化为用户可理解的叙述：

```typescript
interface DecisionProcessVisualization {
  // 排除过程
  eliminationProcess: Array<{
    candidateId: string;
    candidateName: string;
    eliminated: boolean;
    eliminationReason?: string;
    eliminationEvidence?: string;
    stage: 'HARD_GATE' | 'SOFT_GATE' | 'TRADEOFF' | 'FINAL';
  }>;
  
  // 权衡可视化
  tradeoffVisualization: Array<{
    dimension: string;
    sacrifice: string;
    gain: string;
    marginalRate: string;
  }>;
  
  // 不确定性可视化
  uncertaintyVisualization: {
    sources: string[];
    distribution: { p10: string; p50: string; p90: string };
    whatIfScenarios: string[];
  };
}
```

### 2. 方案对比可视化

结构化的方案对比：

```typescript
interface PlanComparisonVisualization {
  plans: Array<{
    planId: string;
    positioning: string;  // "高体验型" / "平衡型" / "保底型"
    
    highlights: string[];  // 亮点
    warnings: string[];    // 警告
    
    scores: {
      experience: StarRating;
      safety: StarRating;
      cost: StarRating;
      time: StarRating;
    };
    
    riskStatement: string;  // "你在为这个风险付费：……"
  }>;
  
  // 关键差异
  keyDifferences: Array<{
    dimension: string;
    planA: string;
    planB: string;
    planC: string;
    winner: string;
    tradeoff: string;
  }>;
  
  // 推荐说明
  recommendation: {
    recommendedPlan: string;
    reason: string;
    condition: string;  // "如果你更看重 X，则选 Y"
  };
}
```

### 3. 风险说明可视化

将风险转化为用户可理解的叙述：

```typescript
interface RiskVisualization {
  // 风险故事
  riskNarrative: string;  // "这条路线经过高原地区，天气变化可能导致……"
  
  // 你在为什么付费
  whatYouPayFor: string;  // "你在为「风景体验」付出「天气风险」代价"
  
  // 用户判断点
  judgmentQuestion: string;  // "你愿意接受这个风险吗？"
  
  // 选择的影响
  choiceImpact: {
    ifAccept: string;
    ifReject: string;
  };
}
```

---

## 输入/输出 Schema

### 输入：NarratorInput

```typescript
{
  request_id: string;
  
  // 决策结果
  decision_result: {
    ranked_plans: RankedPlan[];
    eliminated_candidates: EliminatedCandidate[];
    tradeoffs: Tradeoff[];
    uncertainties: Uncertainty[];
  };
  
  // 门控结果
  gate_result: GateResult;
  
  // 风险评估
  risk_assessment: RiskAssessment;
  
  // 行程数据（用于逐日叙述）
  itinerary?: Itinerary;
  
  // 决策日志
  decision_log: DecisionLogEntry[];
}
```

### 输出：NarratorOutput

```typescript
{
  request_id: string;
  
  // 核心：决策过程可视化
  decision_story: {
    // 开篇总结
    opening: string;  // "我为你评估了 X 个方案，最终推荐……"
    
    // 排除过程
    elimination_narrative: Array<{
      stage: string;
      eliminated: string[];
      reason: string;
      evidence: string;
    }>;
    
    // 最终候选
    finalist_narrative: Array<{
      planId: string;
      positioning: string;
      whyConsidered: string;
      tradeoffSummary: string;
    }>;
    
    // 推荐说明
    recommendation_narrative: {
      recommendedPlan: string;
      reason: string;
      confidence: string;
      caveat: string;  // "但如果你更看重 X……"
    };
  };
  
  // 方案对比可视化
  comparison_visualization: PlanComparisonVisualization;
  
  // 风险可视化
  risk_visualization: RiskVisualization;
  
  // 不确定性可视化
  uncertainty_visualization: {
    overall_confidence: string;  // "这个推荐的置信度是 75%"
    uncertainty_sources: Array<{
      source: string;
      impact: string;
      whatIf: string;
    }>;
  };
  
  // 逐日叙述（如有行程）
  day_by_day?: Array<{
    date: string;
    day_summary: string;
    highlights: string[];
    warnings: string[];
    tips: string[];
  }>;
  
  // 用户判断点
  user_judgment_points: Array<{
    questionId: string;
    question: string;
    options: string[];
    impact: string;
  }>;
}
```

---

## 叙述生成规则

### 排除过程叙述模板

```markdown
## 我是如何做决策的

### 第一轮：硬门控
我首先排除了 {N} 个不可行的方案：
- **方案 A**：{排除原因} — {证据}
- **方案 B**：{排除原因} — {证据}

### 第二轮：软约束检查
剩余 {N} 个方案中，{N} 个需要调整：
- **方案 C**：{需要调整的原因} — {建议的调整}

### 第三轮：权衡评估
进入最终评估的 {N} 个方案：
- **方案 D**：{定位} — {关键特点}
- **方案 E**：{定位} — {关键特点}

### 我的推荐
推荐 **方案 D**，因为：
- {原因 1}
- {原因 2}

但如果你更看重 {X}，可以考虑 **方案 E**。
```

### 权衡说明模板

```markdown
## 选择这个方案意味着

### 你获得的
- ✓ {获得 1}
- ✓ {获得 2}

### 你付出的代价
- ✗ {代价 1}
- ✗ {代价 2}

### 权衡总结
> 你在为「{获得}」付出「{代价}」的代价

### 替代方案
如果你不愿意付出这个代价，可以选择 **方案 X**，它会……
```

### 不确定性说明模板

```markdown
## 关于不确定性

这个推荐的置信度是 **{X}%**。

### 主要不确定性来源
1. **{来源 1}**：{影响说明}
   - 如果发生：{后果}
   - 缓解措施：{建议}

2. **{来源 2}**：{影响说明}
   - 如果发生：{后果}
   - 缓解措施：{建议}

### 不同情况下的预期
- **乐观情况（20%）**：{描述}
- **中位情况（60%）**：{描述}
- **保守情况（20%）**：{描述}
```

---

## 禁止事项

### 不允许修改硬字段

Narrator 只负责**叙述**，不能修改：
- 时间（start_window / end_window）
- 地点（location_ref）
- 证据（evidence_refs）
- 门控结果（gate_result）
- 评分数据（scores）

### 不允许隐藏信息

必须展示：
- 所有被排除的方案及原因
- 所有权衡和代价
- 所有不确定性
- 所有需要用户确认的风险

### 不允许编造事实

所有叙述必须基于输入数据，不能：
- 编造交通班次
- 编造开放时间
- 编造票价
- 编造安全结论

---

## 输出要求

1. **必须展示排除过程**：不能只给结果
2. **必须展示权衡代价**：不能只说好处
3. **必须展示不确定性**：不能只给确定答案
4. **必须保持数据完整性**：不能修改硬字段

---

## 允许调用的 Skills

- `narrative.generateStory` - 叙述生成
- `visualization.comparison` - 对比可视化
- `visualization.risk` - 风险可视化
- `visualization.uncertainty` - 不确定性可视化

---

## 与其他 Agent 的协作

| 协作 Agent | 协作方式 |
|------------|----------|
| **CoreDecision** | 接收 `DecisionOutput` 用于可视化 |
| **Compliance** | 接收风险评估用于风险叙述 |
| **TripDetail** | 配合决策回放功能 |
| **DecisionReplay** | 配合 What-If 模拟的可视化 |
| **RLHFCollector** | 触发用户交互信号收集 |

---

## AI-Native 核心方法

### generateDecisionStory()

生成决策叙事，包含排除、入围、推荐三个部分：

```typescript
generateDecisionStory(decisionOutput: DecisionOutput): DecisionStory

interface DecisionStory {
  elimination_narrative: {
    total_evaluated: number;
    eliminated_count: number;
    stages: Array<{
      stage_name: string;
      eliminated: Array<{
        plan_id: string;
        plan_name: string;
        reason: string;
        evidence: string;
      }>;
    }>;
  };
  
  finalist_narrative: {
    finalists: Array<{
      plan_id: string;
      plan_name: string;
      positioning: string;
      strengths: string[];
      weaknesses: string[];
      best_for: string;
    }>;
  };
  
  recommendation_narrative: {
    recommended_plan_id: string;
    recommended_plan_name: string;
    primary_reason: string;
    secondary_reasons: string[];
    confidence_statement: string;
    alternative_suggestion: string;
  };
}
```

### generateDecisionVisualization()

生成前端可直接使用的可视化数据结构：

```typescript
generateDecisionVisualization(decisionOutput: DecisionOutput): DecisionVisualization

interface DecisionVisualization {
  comparison_chart: {
    dimensions: TradeoffDimension[];
    plans: Array<{
      plan_id: string;
      plan_name: string;
      values: Record<TradeoffDimension, number>;
      color: string;
    }>;
  };
  
  risk_gauge: {
    plans: Array<{
      plan_id: string;
      risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
      risk_percentage: number;
      risk_label: string;
    }>;
  };
  
  uncertainty_distribution: {
    overall_confidence: number;
    confidence_label: string;
    sources: Array<{
      source: string;
      impact: number;
      description: string;
    }>;
  };
}
```

### generateFullDecisionPresentation()

面向前端的完整决策展示入口：

```typescript
generateFullDecisionPresentation(decisionOutput: DecisionOutput): {
  story: DecisionStory;
  visualization: DecisionVisualization;
  simplified_narrative: string;
  user_actions: Array<{
    action_type: 'ACCEPT' | 'COMPARE' | 'MODIFY' | 'QUESTION';
    label: string;
    description: string;
    target?: string;
  }>;
}
```

### 前端集成示例

```tsx
// React 组件示例
const DecisionPresentation: React.FC<{ output: DecisionOutput }> = ({ output }) => {
  const presentation = narratorAgent.generateFullDecisionPresentation(output);
  
  return (
    <div className="decision-presentation">
      {/* 决策故事 */}
      <EliminationProcess stages={presentation.story.elimination_narrative.stages} />
      <FinalistComparison finalists={presentation.story.finalist_narrative.finalists} />
      <Recommendation {...presentation.story.recommendation_narrative} />
      
      {/* 可视化 */}
      <RadarChart data={presentation.visualization.comparison_chart} />
      <RiskGauge data={presentation.visualization.risk_gauge} />
      <ConfidenceMeter data={presentation.visualization.uncertainty_distribution} />
      
      {/* 用户操作 */}
      <ActionButtons actions={presentation.user_actions} />
    </div>
  );
};
```

---

## Claude 快捷唤起

```
作为 TripNARA 的 Narrator，请将决策结果转化为可视化叙述：
[决策结果]

要求：
1. 展示排除过程（哪些方案被排除，为什么）
2. 展示权衡代价（选择意味着获得什么、放弃什么）
3. 展示不确定性（置信度、不确定性来源）
4. 生成方案对比可视化
5. 识别用户判断点（而非确认点）
6. 不修改任何硬字段
```
