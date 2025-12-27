# ToT 评分函数设计文档

## 概述

本文档描述了一套完整的 ToT (Tree of Thoughts) 评分函数系统，用于评估候选思路的质量。系统采用 **硬门控 + 软评分** 的两阶段设计，确保只有可行的候选进入评分阶段。

## 架构设计

### 总结构：Hard Gate + Soft Score

```
候选思路 → Hard Gate → [通过] → 5维度评分 → 加权聚合 → 最终得分 (0..100)
           ↓ [拒绝]
        直接淘汰 (score=0)
```

### 1. Hard Gate（硬门控）

硬门控检查必然失败的情况，直接淘汰候选思路。规则包括：

1. **硬节点不可行**
   - 任意硬节点（`is_hard_node` / `locked` / `anchor` / `fixedEvents`）不可行
   - `CLOSED_DAY` / `TIME_WINDOW_CONFLICT` 发生在硬节点上

2. **严重超时**
   - `INSUFFICIENT_TOTAL_TIME` 严重超日界（超出 `day_boundary.end > 30min` 且影响硬节点）

3. **硬约束违反**
   - 轮椅/步行/换乘等硬约束违反（`PlanningPolicy.constraints`）

4. **空计划**
   - 计划中没有活动

### 2. Soft Score（软评分）

通过硬门控的候选进入 5 维度评分：

- **S_cost**: 成本得分（预算利用率 + 超预算惩罚）
- **S_risk**: 风险得分（违约风险 + 鲁棒性）
- **S_pref**: 偏好得分（意图匹配 + 体验质量 + 多样性）
- **S_time**: 时间窗得分（利用率 + 等待/旅行惩罚 + 关键时间窗紧张度）
- **S_req**: 必达点得分（覆盖率 + 丢弃惩罚 & 奖励 + 优先级保护）

最终得分公式：

```
S_total = (w_cost * S_cost + w_risk * S_risk + w_pref * S_pref + w_time * S_time + w_req * S_req) / Σw_i
score = 100 * S_total
```

## 五维度评分公式

### 2.1 成本得分 S_cost

**核心逻辑**：预算利用率 + 超预算惩罚 + 时间-金钱 tradeoff

```typescript
C = plan.metrics.estTotalCost
B = tripContext.budget.amount
r = C / B

if B missing:
  S_cost = clamp01(1 - C / C_ref)  // 用参考成本估算
else:
  if r <= 0.85: S_cost = 1.0 - 0.2*(0.85 - r)/0.85         // 太省钱略扣
  if 0.85 < r <= 1.0: S_cost = 1.0 - 0.3*(r - 0.85)/0.15   // 理想区间
  if r > 1.0:  S_cost = exp(-4.0*(r - 1.0))                // 超预算指数惩罚
```

**时间价值换算**：
```typescript
V = valueOfTimePerMin
ΔT = travelMin + waitMin
C_eff = C + V*ΔT  // 用 C_eff 替换 C
```

**输出 metrics**：
- `cost`: 总成本
- `effectiveCost`: 有效成本（含时间价值）
- `costRatio`: 预算占比
- `overBudgetPenalty`: 超预算比例

### 2.2 风险得分 S_risk

**核心逻辑**：违约风险 + 鲁棒性，根据用户风险容忍度调整

```typescript
// (A) 活动级风险
riskLevelScore = {low: 0.2, medium: 0.5, high: 0.85}[riskLevel]
weatherScore = weatherSensitivity / 3
inventoryScore = (inventoryRisk - 1) / 4
bookingScore = (bookingDifficulty - 1) / 4
bookingPressure = requiresBooking && inventoryRisk >= 4 ? 0.2 : 0

activityRisk = 0.4*riskLevelScore + 0.25*weatherScore + 0.2*inventoryScore + 0.1*bookingScore + 0.05*bookingPressure

// (B) 计划级风险（紧张度）
slackMin = min(top3_min_slack_nodes.slack_min)
tightness = clamp01((30 - slackMin) / 30)  // slack<30 线性变差

// (C) 鲁棒性风险等级
robustRiskScore = {low: 0.2, medium: 0.5, high: 0.85}[robustness.risk_level]

// (D) 合成风险指数
riskIndex = 0.35*avgActivityRisk + 0.25*tightness + 0.25*robustRiskScore + 0.15*bookingPressure

// (E) 根据用户风险容忍度调整
mult = {low: 1.25, medium: 1.0, high: 0.85}[userRiskTolerance]
S_risk_base = clamp01(1 - mult * riskIndex)

// (F) 鲁棒性加成
buffer = robustness.total_buffer_minutes
robustnessScore = plan.metrics.robustnessScore
S_robust = clamp01(0.6*robustnessScore + 0.4*(1 - exp(-buffer/60)))

// 最终合成
S_risk = 0.7*S_risk_base + 0.3*S_robust
```

**输出 metrics**：
- `avgActivityRisk`: 平均活动风险
- `slackMin`: 最小 slack（分钟）
- `tightness`: 紧张度
- `riskIndex`: 风险指数
- `buffer`: 缓冲时间（分钟）
- `robustnessScore`: 鲁棒性分数

### 2.3 偏好得分 S_pref

**核心逻辑**：意图匹配 + 体验质量 + 多样性惩罚

```typescript
// (A) 意图匹配
for each activity:
  intentMatch = Σ userIntents[tag] * affinity[tag] / Σ userIntents
  if hasDislikeTag: intentMatch -= 0.3

S_intent = clamp01(avg(intentMatch) - 0.3*dislikeHitRate)

// (B) 体验质量
S_quality = clamp01(0.6*avg(qualityScore) + 0.4*avg(uniquenessScore))
S_must = clamp01(mustSeeCoveredRatio)

S_pref = clamp01(0.65*S_intent + 0.25*S_quality + 0.10*S_must)

// (C) 多样性惩罚
maxTagShare = max(tagCounts) / totalTagCount
divPenalty = diversityPenalty * max(0, (maxTagShare - 0.45) / 0.55)
S_pref = clamp01(S_pref - divPenalty)
```

**输出 metrics**：
- `avgIntentMatch`: 平均意图匹配度
- `dislikeHitRate`: 不喜欢标签命中率
- `sQuality`: 质量得分
- `mustSeeCoveredRatio`: 必看景点覆盖率
- `maxTagShare`: 最大标签占比
- `divPenalty`: 多样性惩罚

### 2.4 时间窗得分 S_time

**核心逻辑**：利用率 + 等待/旅行惩罚 + 关键时间窗紧张度

```typescript
// (A) 利用率
util = service / day
S_util = clamp01((util - 0.35) / 0.35)  // util>=0.70 得分接近1

// (B) 等待/旅行惩罚
travelRatio = travel / day
waitRatio = wait / day
pen = travelWeight * travelRatio + waitWeight * waitRatio
S_flow = clamp01(1 - pen)

// (C) 关键时间窗紧张度
slackCloseMin = min(critical_windows.slack_to_close_min)
S_window = clamp01(slackCloseMin / 30)  // >=30min => 1

// 合成
S_time = 0.45*S_util + 0.35*S_flow + 0.20*S_window
```

**输出 metrics**：
- `travelMin`: 旅行时间（分钟）
- `waitMin`: 等待时间（分钟）
- `serviceMin`: 服务时间（分钟）
- `dayMin`: 总日时长（分钟）
- `util`: 利用率
- `slackCloseMin`: 最小关闭 slack（分钟）

### 2.5 必达点得分 S_req

**核心逻辑**：覆盖率 + 丢弃惩罚 & 奖励 + 优先级保护

```typescript
// (A) 覆盖率
hardCovered = visitedHard / totalHard
S_cover = hardCovered

// (B) 丢弃惩罚 & 奖励
loss = Σ droppedNodes.drop_penalty * w_drop
gain = Σ visitedNodes.reward * w_reward
scale = max(100, loss + gain)
S_value = clamp01((gain - loss) / scale + 0.5)

// (C) 优先级保护
priorityLoss = count(dropped priority<=2) / max(1, totalPriority12)
S_req = clamp01(0.70*S_cover + 0.25*S_value - 0.30*priorityLoss)
```

**输出 metrics**：
- `hardCovered`: 硬节点覆盖率
- `visitedHard`: 已访问硬节点数
- `totalHard`: 总硬节点数
- `dropLoss`: 丢弃损失
- `rewardGain`: 奖励收益
- `priorityLoss`: 优先级损失

## 权重矩阵

### 基础权重（从 ObjectiveWeights 映射）

```typescript
w_pref = ObjectiveWeights.satisfaction
w_risk = ObjectiveWeights.violationRisk + 0.5*ObjectiveWeights.robustness
w_cost = ObjectiveWeights.cost
w_time = (obj.travel ?? 1.0) + (obj.wait ?? 1.5)
w_req  = (obj.drop_penalty ?? 1.0) + 0.5*(obj.reward ?? 1.0)
```

### 动态调整规则

#### 1. Pacing 调整

```typescript
relaxed:  +0.10 pref, +0.10 risk(robust), -0.10 time
intense:  +0.15 time, -0.05 risk, -0.10 cost
```

#### 2. RiskTolerance 调整

```typescript
low:   +0.15 risk, +0.05 req, -0.10 pref, -0.10 time
high:  -0.10 risk, +0.10 pref, +0.05 time, -0.05 cost
```

#### 3. BudgetStyle 调整

```typescript
low:   +0.20 cost, -0.10 pref, -0.10 time
high:  -0.10 cost, +0.10 pref, +0.05 time, -0.05 risk
```

#### 4. 必达点强制保护

```typescript
if hasAnchors || hardNodeCount > 0:
  w_req = max(w_req, 0.25)
  if hardNodeCount >= 3:
    w_req = max(w_req, 0.35)
```

### 归一化

所有权重调整后，归一化到总和为 1：

```typescript
sum = w_cost + w_risk + w_pref + w_time + w_req
w_i_normalized = w_i / sum
```

## 使用示例

### 基本使用

```typescript
import { ToTEvaluatorService } from './tot/tot-evaluator.service';
import { ThoughtNode } from './tot/tot-evaluator.interface';

const evaluator = new ToTEvaluatorService();

const node: ThoughtNode = {
  world: tripWorldState,
  plan: candidatePlan,
  optimizationResult: optimizationResult, // 可选
};

const result = await evaluator.evaluate(node);

if (result.allowed) {
  console.log(`得分: ${result.score}/100`);
  console.log(`各维度:`, result.dims);
  console.log(`权重:`, result.weights);
  console.log(`详细指标:`, result.metrics);
} else {
  console.log(`被硬门控拒绝:`, result.hardViolations);
}
```

### 集成到 ToT 框架

```typescript
// 在 ToT 的 beam search 中使用
async function beamSearch(
  root: ThoughtNode,
  beamWidth: number = 4,
  maxDepth: number = 3
): Promise<ThoughtNode[]> {
  const evaluator = new ToTEvaluatorService();
  let candidates: ThoughtNode[] = [root];

  for (let depth = 0; depth < maxDepth; depth++) {
    // 评估所有候选
    const scored = await Promise.all(
      candidates.map(async (node) => {
        const score = await evaluator.evaluate(node);
        return { node, score };
      })
    );

    // 过滤被硬门控拒绝的
    const allowed = scored.filter(s => s.score.allowed);

    // 按得分排序，取 top-k
    allowed.sort((a, b) => b.score.score - a.score.score);
    candidates = allowed.slice(0, beamWidth).map(s => s.node);

    // 扩展候选（生成子节点）
    candidates = await expandCandidates(candidates);
  }

  return candidates;
}
```

## 默认参数

### 初版推荐（moderate）

- **成本超预算指数惩罚系数**: `k = 4.0`
- **slack 阈值**: `30min`（<30 开始线性变差）
- **buffer 增益半衰**: `60min`
- **多样性阈值**: `maxTagShare = 0.45`

### Beam Search 推荐

- `maxDepth = 3`
- `beamWidth = 4`
- `branchFactor = 12`
- `timeBudgetMs = 1200`

## 可解释性与日志

### 评分结果结构

```typescript
interface ToTScoreBreakdown {
  allowed: boolean;              // 是否通过硬门控
  hardViolations: string[];      // 硬违规列表
  score: number;                 // 总分 (0..100)
  dims: {                        // 各维度得分 (0..1)
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
  };
  weights: {                     // 各维度权重
    cost: number;
    risk: number;
    pref: number;
    time: number;
    req: number;
  };
  metrics: Record<string, any>;  // 详细指标
}
```

### 日志建议

每层记录：
- TopK 候选的：`dims` + `weights` + 关键 `metrics` + 淘汰原因
- 最终 best 的"节点链"与每步 `operator` / `rationale`

示例日志格式：

```json
{
  "depth": 1,
  "candidates": [
    {
      "nodeId": "node_1",
      "score": 85.3,
      "dims": {"cost": 0.9, "risk": 0.8, "pref": 0.85, "time": 0.75, "req": 0.95},
      "weights": {"cost": 0.2, "risk": 0.25, "pref": 0.25, "time": 0.15, "req": 0.15},
      "metrics": {
        "costRatio": 0.85,
        "slackMin": 45,
        "intentMatch": 0.9,
        "hardCovered": 1.0
      },
      "operator": "add_activity",
      "rationale": "添加高质量景点，提升偏好得分"
    }
  ],
  "rejected": [
    {
      "nodeId": "node_2",
      "reason": "HARD_NODE_CLOSED",
      "violations": ["硬节点被闭馆"]
    }
  ]
}
```

## 调参策略

### 快速调参流程

1. **看日志** → 识别哪一维压错了
2. **调 weight** → 调整对应维度的权重
3. **调阈值** → 调整公式中的阈值参数
4. **复现验证** → 使用相同 seed 验证效果

### 常见调参场景

| 问题 | 调参方向 |
|------|---------|
| 成本超预算太多 | 增加 `w_cost` 或提高超预算惩罚系数 |
| 风险太高 | 增加 `w_risk` 或降低风险容忍度倍数 |
| 偏好匹配差 | 增加 `w_pref` 或提高意图匹配权重 |
| 时间利用率低 | 增加 `w_time` 或调整利用率阈值 |
| 必达点丢失 | 增加 `w_req` 或提高硬节点保护权重 |

## 文件结构

```
src/trips/decision/tot/
├── tot-evaluator.interface.ts    # 接口定义
├── tot-evaluator.service.ts      # 主评分器服务
├── dimension-scorers.ts           # 五维度评分函数
├── weight-computer.ts             # 权重计算与动态调整
├── hard-gate.ts                   # 硬门控逻辑
├── tot-evaluator.module.ts        # NestJS 模块
└── __tests__/
    └── tot-evaluator.spec.ts     # 单元测试
```

## 后续优化方向

1. **从候选池查找活动信息**：当前简化处理，需要完善从 `world.candidatesByDate` 查找 `ActivityCandidate` 的逻辑
2. **从 PlanningPolicy 获取参数**：完善从 `PlanningPolicy` 获取 `tagAffinity`、`diversityPenalty`、`mustSeeBoost` 等参数
3. **从优化结果获取 PlanRequest**：完善从 `OptimizationResult` 中提取 `PlanRequest` 的逻辑
4. **硬约束检查完善**：完善轮椅可达、楼梯、换乘等硬约束的检查逻辑
5. **性能优化**：对于大量候选，考虑并行评估或缓存中间结果

