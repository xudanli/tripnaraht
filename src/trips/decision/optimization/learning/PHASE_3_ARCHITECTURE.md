# Phase 3: Multi-Agent Negotiation + Learnable Weights

## 概述

Phase 3 实现 TripNARA 的**物种跃迁**：

1. **多智能体协商系统**：Abu/Dre/Neptune 从"策略模块"升级为"推理人格"，可以辩论、协商、投票
2. **可学习权重**：目标函数权重从固定配置升级为从用户反馈自动学习

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                Multi-Agent Negotiation System                       │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │    Abu      │  │    Dre      │  │  Neptune    │                 │
│  │   守护者    │  │  节奏大师   │  │  哲学守护    │                 │
│  │             │  │             │  │             │                 │
│  │ 风险最小化  │  │ 资源调度    │  │ 结构守恒    │                 │
│  │ CONSERVATIVE│  │  MODERATE   │  │  MODERATE   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │   Guardian Debate     │                              │
│              │                       │                              │
│              │  1. 独立评估          │                              │
│              │  2. 检测分歧          │                              │
│              │  3. 多轮辩论          │                              │
│              │  4. 协商投票          │                              │
│              │  5. 生成决策          │                              │
│              └───────────────────────┘                              │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │   Weight Learner      │                              │
│              │                       │                              │
│              │  • 收集用户反馈       │                              │
│              │  • 计算梯度           │                              │
│              │  • 更新权重           │                              │
│              │  • 持续优化           │                              │
│              └───────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

## 三种人格的核心价值观

| 人格 | 核心目标 | 优先维度 | 风险容忍度 | 决策风格 |
|------|----------|----------|------------|----------|
| **Abu** | 确保安全，最小化不可接受风险 | safety, weatherRisk, fatigueRisk | CONSERVATIVE | ANALYTICAL |
| **Dre** | 优化时间体力分配，确保可持续节奏 | fatigueRisk, pacingVariance, timeSlack | MODERATE | BALANCED |
| **Neptune** | 守护路线哲学，保持体验完整性 | philosophyAlignment, experienceDensity | MODERATE | INTUITIVE |

## 协商流程

### 1. 独立评估

每个人格基于自己的价值观评估计划：

```typescript
// Abu 的评估
{
  persona: 'ABU',
  utility: 0.72,           // 基于 Abu 权重偏好的效用
  primaryConcerns: ['存在 2 个硬约束违反'],
  positiveAspects: ['天气条件良好'],
  stance: 'CONCERN',       // 立场：存有顾虑
  confidence: 0.85
}

// Dre 的评估
{
  persona: 'DRE',
  utility: 0.58,
  primaryConcerns: ['疲劳风险偏高 (25%)', '节奏不均衡'],
  stance: 'NEUTRAL',
  confidence: 0.78
}

// Neptune 的评估
{
  persona: 'NEPTUNE',
  utility: 0.85,
  positiveAspects: ['充分体现路线哲学', '体验丰富'],
  stance: 'SUPPORT',
  confidence: 0.82
}
```

### 2. 辩论过程

```typescript
// Round 1
[
  { fromPersona: 'ABU', type: 'OPPOSE', content: '存在安全隐患...' },
  { fromPersona: 'DRE', type: 'CONDITIONAL', content: '建议调整节奏...' },
  { fromPersona: 'NEPTUNE', type: 'SUPPORT', content: '支持这个计划...' }
]

// Round 2
[
  { fromPersona: 'ABU', type: 'OPPOSE', targetPersona: 'NEPTUNE', content: '体验不能以安全为代价...' },
  { fromPersona: 'NEPTUNE', type: 'CONDITIONAL', inResponseTo: 'ABU', content: '同意增加安全措施...' }
]
```

### 3. 投票决策

```typescript
{
  votes: [
    { persona: 'ABU', vote: 'ABSTAIN', weight: 1.5, conditions: ['处理硬约束'] },
    { persona: 'DRE', vote: 'APPROVE', weight: 1.0, conditions: ['插入休息日'] },
    { persona: 'NEPTUNE', vote: 'APPROVE', weight: 1.0 }
  ],
  decision: 'CONDITIONAL_APPROVE',
  consensusLevel: 0.72
}
```

## 权重学习系统

### 学习信号

| 信号类型 | 强度 | 影响的权重 |
|----------|------|------------|
| 满意度评分 (1-5) | 高 | 所有维度 |
| 疲劳报告 | 中 | fatigueRisk |
| 计划修改（拆天/休息日） | 中 | fatigueRisk, timeSlack |
| 计划修改（删除活动） | 中 | experienceDensity |
| 提前结束行程 | 强 | safety, fatigueRisk |

### 梯度下降算法

```
对于每个反馈 fb:
  error = predicted_utility - actual_satisfaction
  
  对于每个维度 d:
    gradient[d] += learning_rate × error × relevance[d] × recency_weight
    
  应用正则化:
    gradient[d] -= regularization × (current_weight[d] - default_weight[d])

更新权重:
  new_weight[d] = current_weight[d] + gradient[d]
  new_weight[d] = clamp(new_weight[d], min=0.02, max=0.5)
  normalize(new_weights)
```

### 学习示例

```typescript
// 用户反馈：行程太累
const feedback: FeedbackRecord = {
  type: 'SATISFACTION_RATING',
  data: {
    overallSatisfaction: 2,    // 2/5
    pacingComfort: 1,          // 1/5 - 很累
    experienceQuality: 4,      // 4/5 - 体验不错
  },
  weightsAtTime: currentWeights,
  utilityAtTime: 0.75
};

// 学习结果
const result = await weightLearner.learnFromFeedback(userId, [feedback]);
// result.weightChanges = {
//   fatigueRisk: +0.05,      // 提高疲劳风险权重
//   timeSlack: +0.03,        // 提高时间余量权重
//   experienceDensity: -0.02 // 略降体验密度权重
// }
```

## 文件结构

```
src/trips/decision/optimization/learning/
├── guardian-persona.interface.ts  # 人格接口定义
├── guardian-debate.service.ts     # 辩论服务实现
├── weight-learner.service.ts      # 权重学习服务
├── index.ts                       # 模块导出
└── PHASE_3_ARCHITECTURE.md        # 本文档
```

## 使用示例

### 执行协商

```typescript
const result = await guardianDebate.negotiate(plan, world);

console.log(`决策: ${result.decision}`);
console.log(`共识度: ${(result.consensusLevel * 100).toFixed(0)}%`);
console.log(`辩论轮数: ${result.debateRounds.length}`);

for (const eval of result.evaluations) {
  console.log(`${eval.persona}: ${eval.stance} (${(eval.utility * 100).toFixed(0)}%)`);
}

if (result.conditions) {
  console.log(`条件: ${result.conditions.join(', ')}`);
}
```

### 学习权重

```typescript
// 收集反馈
weightLearner.recordFeedback({
  userId: 'user_123',
  tripId: 'trip_456',
  type: 'SATISFACTION_RATING',
  timestamp: new Date().toISOString(),
  data: {
    overallSatisfaction: 4,
    pacingComfort: 5,
  },
  weightsAtTime: currentWeights,
  utilityAtTime: 0.72,
});

// 学习
const history = weightLearner.getUserFeedbackHistory('user_123');
const result = await weightLearner.learnFromFeedback('user_123', history);

console.log(`学习置信度: ${(result.confidence * 100).toFixed(0)}%`);
console.log(`主要因素: ${result.analysis.mainFactors.join(', ')}`);
```

## 完整决策流程

```
┌──────────────────────────────────────────────────────────────────┐
│  用户请求: "帮我规划冰岛 7 天自驾"                               │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 1: 目标函数评估                                           │
│  ObjectiveFunction.evaluate(plan, world)                         │
│  → utility = 0.72                                                │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 2: 概率化 + Monte Carlo                                   │
│  ExpectedUtilityService.computeExpectedUtility(...)              │
│  → E[U] = 0.68, CI = [0.61, 0.75], P(feasible) = 0.92           │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  Phase 3: 多智能体协商                                           │
│  GuardianDebateService.negotiate(plan, world)                    │
│                                                                  │
│  Abu: "存在安全顾虑" → CONCERN                                   │
│  Dre: "节奏需要调整" → NEUTRAL                                   │
│  Neptune: "哲学匹配良好" → SUPPORT                               │
│                                                                  │
│  → 2 轮辩论后达成共识 (78%)                                      │
│  → 决策: CONDITIONAL_APPROVE                                     │
│  → 条件: "处理 F-road 许可证", "第3天后插入休息日"               │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  行程执行 + 反馈收集                                             │
│                                                                  │
│  Day 3: 用户报告疲劳度高 → 记录反馈                              │
│  Day 7: 满意度评分 4/5 → 记录反馈                                │
│                                                                  │
│  WeightLearner.learnFromFeedback(...)                            │
│  → fatigueRisk 权重 +3%                                          │
│  → experienceDensity 权重 -1%                                    │
└──────────────────────────────────────────────────────────────────┘
```

## 与 Phase 1/2 的关系

| 能力 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| 效用计算 | 确定性 | 期望值 (Monte Carlo) | 期望值 + 人格偏好 |
| 决策方式 | 单一优化器 | 单一优化器 + 风险指标 | 多智能体协商 |
| 权重 | 固定配置 | 固定配置 | 可学习 |
| 输出 | ALLOW/REJECT/ADJUST | + 置信区间 + 风险分析 | + 辩论记录 + 人类判断点 |

---

*Phase 3 完成后，TripNARA 成为"在不确定世界中持续自我优化的决策体"。*

*这是真正的**物种跃迁**：从工具到智能系统。*
