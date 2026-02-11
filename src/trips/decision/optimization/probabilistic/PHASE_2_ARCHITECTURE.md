# Phase 2: Probabilistic World Model + Monte Carlo Expected Utility

## 概述

Phase 2 将 TripNARA 从**点估计**升级为**概率分布**，实现真正的不确定性建模。

核心变化：
- **物理现实** = 概率分布（天气、道路、危险）
- **人体能力** = 概率分布（疲劳容忍度含方差）
- **效用计算** = Monte Carlo 期望效用

## 数学基础

### 从点估计到概率分布

**旧版（Phase 1）：**
```
windSpeedMs = 15          // 点估计
accessibilityScore = 0.7  // 点估计 + 置信度
```

**新版（Phase 2）：**
```
windSpeed ~ N(μ=15, σ²=25)           // 高斯分布
accessibility ~ Beta(α=14, β=6)      // Beta 分布
fatigueThreshold ~ TruncatedNormal(μ=1.15, σ²=0.04, [0.5, 2.0])
```

### 期望效用

```
E[U(plan)] = ∫ U(plan|s) × P(s) ds
           ≈ (1/N) × Σᵢ U(plan|sᵢ)  where sᵢ ~ P(WorldState)
```

## 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Monte Carlo Engine                              │
│                                                                     │
│  ┌────────────────────┐    ┌────────────────────┐                  │
│  │ Probabilistic      │    │ Expected Utility   │                  │
│  │ World Model        │───▶│ Service            │                  │
│  │                    │    │                    │                  │
│  │ • Weather ~ Dist   │    │ • Sample N times   │                  │
│  │ • Road ~ Dist      │    │ • Evaluate each    │                  │
│  │ • Human ~ Dist     │    │ • Aggregate stats  │                  │
│  └────────────────────┘    └────────────────────┘                  │
│           │                         │                               │
│           ▼                         ▼                               │
│  ┌────────────────────────────────────────────────┐                │
│  │              Bayesian Update                   │                │
│  │                                                │                │
│  │   Prior × Likelihood ∝ Posterior               │                │
│  │   P(θ|data) ∝ P(data|θ) × P(θ)                │                │
│  └────────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

## 分布类型

| 分布类型 | 用途 | 参数 | 示例 |
|----------|------|------|------|
| Gaussian | 连续变量 | μ, σ² | 温度、风速 |
| Beta | 概率值 | α, β | 可达性、成功率 |
| TruncatedNormal | 有界连续 | μ, σ², [a,b] | 疲劳指数 [0,2] |
| Categorical | 离散状态 | categories, probs | 道路状态 |
| Poisson | 计数事件 | λ | 延误次数 |
| Exponential | 等待时间 | rate | 渡轮延误 |

## 文件结构

```
src/trips/decision/optimization/probabilistic/
├── distribution.interface.ts           # 分布类型定义
├── probabilistic-world-model.interface.ts  # 概率世界模型接口
├── probabilistic-world-model.service.ts    # 概率世界模型实现
├── expected-utility.service.ts         # 期望效用计算
├── index.ts                            # 模块导出
└── PHASE_2_ARCHITECTURE.md             # 本文档
```

## 核心接口

### 1. 概率天气模型

```typescript
interface ProbabilisticWeather {
  windSpeed: GaussianDistribution;      // N(μ=15, σ²=25)
  precipitation: GaussianDistribution;  // N(μ=5, σ²=100)
  visibility: GaussianDistribution;     // N(μ=8000, σ²=4000000)
  temperature: GaussianDistribution;    // N(μ=15, σ²=25)
  condition: CategoricalDistribution;   // {clear: 0.5, cloudy: 0.3, rain: 0.15, snow: 0.05}
  extremeEventProbability: number;      // 0.1
}
```

### 2. 概率人体能力

```typescript
interface ProbabilisticHumanCapability {
  maxDailyAscent: GaussianDistribution;       // N(μ=800, σ²=14400)
  fatigueThreshold: TruncatedNormalDistribution; // TN(μ=1.15, σ²=0.04, [0.5, 2.0])
  recoveryRate: BetaDistribution;             // Beta(α=5, β=15) → mean ≈ 0.25
  cumulativeEffectCoefficient: number;        // 0.03 (每天累积3%)
}
```

### 3. 期望效用结果

```typescript
interface ExpectedUtilityResult {
  expectedUtility: number;                    // E[U] = 0.72
  confidenceInterval: { lower, upper, level }; // [0.65, 0.79] @ 95%
  riskMetrics: {
    downRiskProbability: number;              // P(U < 0.5) = 0.08
    worstCase: number;                        // 5% quantile = 0.58
    bestCase: number;                         // 95% quantile = 0.86
    volatility: number;                       // σ = 0.11
  };
  feasibilityProbability: number;             // P(feasible) = 0.94
}
```

## Monte Carlo 算法

```typescript
function computeExpectedUtility(plan, probabilisticContext, weights) {
  const samples = sampleWorldStates(probabilisticContext, N=1000);
  const utilities = [];
  
  for (const sample of samples) {
    // 将概率分布采样为确定值
    const deterministicWorld = {
      windSpeedMs: sample.weather.windSpeedMs,
      roadStatus: sample.roadStatuses,
      fatigueThreshold: sample.humanCapability.fatigueThreshold,
      // ...
    };
    
    // 使用 Phase 1 的目标函数评估
    const utility = objectiveFunction.evaluate(plan, deterministicWorld);
    utilities.push(utility);
  }
  
  return {
    expectedUtility: mean(utilities),
    confidenceInterval: computeCI(utilities, 0.95),
    riskMetrics: computeRiskMetrics(utilities),
  };
}
```

## 贝叶斯更新

当获得新观测数据时，更新概率分布：

```typescript
// 观测到实际风速 = 18 m/s
const observation = {
  type: 'WEATHER',
  observation: { variable: 'windSpeed', value: 18 },
  quality: 'HIGH'
};

// 贝叶斯更新
// Prior: N(μ=15, σ²=25)
// Likelihood: 观测值 18
// Posterior: N(μ'=16.5, σ²'=20)  // 均值向观测移动，方差减小

const updatedContext = probabilisticWorldModel.updateWithObservation(
  context,
  observation
);
```

## 使用示例

### 计算期望效用

```typescript
// 1. 将确定性模型转为概率模型
const probabilisticContext = probabilisticWorldModel.fromDeterministicModel(
  deterministicContext,
  { weatherUncertainty: 0.25, humanCapabilityUncertainty: 0.15 }
);

// 2. 计算期望效用
const result = expectedUtilityService.computeExpectedUtility(
  plan,
  probabilisticContext,
  objectiveWeights,
  { sampleSize: 1000 }
);

console.log(`期望效用: ${result.expectedUtility.toFixed(3)}`);
console.log(`95% 置信区间: [${result.confidenceInterval.lower.toFixed(3)}, ${result.confidenceInterval.upper.toFixed(3)}]`);
console.log(`下行风险: ${(result.riskMetrics.downRiskProbability * 100).toFixed(1)}%`);
```

### 场景分析

```typescript
const scenarios = [
  { name: '乐观情况', conditions: { weather: 'good' }, probability: 0.3 },
  { name: '正常情况', conditions: {}, probability: 0.5 },
  { name: '悲观情况', conditions: { weather: 'bad', roadsClosed: true }, probability: 0.2 },
];

const analysis = expectedUtilityService.scenarioAnalysis(
  plan,
  probabilisticContext,
  weights,
  scenarios
);

for (const scenario of analysis) {
  console.log(`${scenario.scenarioName}: E[U]=${scenario.expectedUtility.toFixed(3)} (P=${scenario.scenarioProbability})`);
}
```

### 方案比较

```typescript
const comparison = expectedUtilityService.comparePlans(
  planA,
  planB,
  probabilisticContext,
  weights
);

console.log(`P(A better) = ${(comparison.probabilityABetter * 100).toFixed(1)}%`);
console.log(`推荐: ${comparison.recommendation}`);
console.log(`置信度: ${(comparison.confidenceInRecommendation * 100).toFixed(1)}%`);
```

## 与 Phase 1 的关系

Phase 2 **扩展** Phase 1，而非替代：

```
┌─────────────────────────────────────────────────────────┐
│  Phase 2: Probabilistic Layer                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ProbabilisticWorldModel → Sample → WorldState   │   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Phase 1: ObjectiveFunction.evaluate(plan, state)│   │
│  └─────────────────────────────────────────────────┘   │
│                          │                              │
│                          ▼                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Aggregate: E[U] = mean(utilities)               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## 性能考虑

| 配置 | 样本数 | 预计耗时 | 精度 |
|------|--------|----------|------|
| 快速评估 | 100 | ~50ms | ±5% |
| 标准评估 | 1000 | ~500ms | ±1.5% |
| 高精度 | 5000 | ~2.5s | ±0.7% |

**优化策略：**
1. 早停（收敛检测）
2. 重要性采样（关注高风险区域）
3. 缓存（相似场景复用）
4. 并行采样

## 为 Phase 3 预留

| Phase 2 能力 | Phase 3 扩展 |
|--------------|--------------|
| 固定权重 | 可学习权重（gradient descent） |
| 独立采样 | 相关性建模（Copula） |
| 单一评估 | 多智能体辩论 |
| 点对点比较 | 帕累托前沿 |

---

*Phase 2 完成后，TripNARA 成为"在不确定世界中进行期望效用最大化"的决策系统。*
