# Phase 1: Objective Function + Explicit Optimizers

## 概述

Phase 1 将 TripNARA 从**规则系统**升级为**优化系统**。

核心变化：
- **Abu**：从布尔判断规则引擎 → 约束满足度优化器
- **Dre**：从启发式调整器 → 时序约束优化器
- **目标函数**：统一的优化目标，八维度效用分解

## 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    StrategyOrchestratorV2                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │    Abu      │  │    Dre      │  │  Neptune    │                 │
│  │  Optimizer  │  │  Optimizer  │  │  (Phase 2)  │                 │
│  │  约束强制   │  │  时序优化   │  │  空间修复   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │   ObjectiveFunction   │                              │
│              │                       │                              │
│              │  ExpectedUtility =    │                              │
│              │  w1×Safety            │                              │
│              │  + w2×Experience      │                              │
│              │  + w3×Philosophy      │                              │
│              │  + w4×TimeSlack       │                              │
│              │  - w5×FatigueRisk     │                              │
│              │  - w6×WeatherRisk     │                              │
│              │  - w7×BudgetOverrun   │                              │
│              │  - w8×PacingVariance  │                              │
│              └───────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

## 文件结构

```
src/trips/decision/optimization/
├── objective-function.interface.ts    # 目标函数接口定义
├── objective-function.service.ts      # 目标函数实现
├── abu-optimizer.service.ts           # Abu 优化器
├── dre-optimizer.service.ts           # Dre 优化器
├── strategy-orchestrator-v2.service.ts # V2 编排器
├── index.ts                           # 模块导出
└── PHASE_1_ARCHITECTURE.md            # 本文档
```

## 核心接口

### 1. ObjectiveFunctionWeights

```typescript
interface ObjectiveFunctionWeights {
  // 正向目标（最大化）
  safety: number;              // w1: 安全性
  experienceDensity: number;   // w2: 体验密度
  philosophyAlignment: number; // w3: 哲学匹配
  timeSlack: number;           // w4: 时间余量

  // 负向惩罚（最小化）
  fatigueRisk: number;         // w5: 疲劳风险
  weatherRisk: number;         // w6: 天气风险
  budgetOverrun: number;       // w7: 预算超支
  pacingVariance: number;      // w8: 节奏方差
}
```

### 2. ObjectiveEvaluationResult

```typescript
interface ObjectiveEvaluationResult {
  totalUtility: number;        // 总效用 (0-1)
  breakdown: { ... };          // 各维度分数
  weightedScores: { ... };     // 加权后分数
  constraints: {
    hardViolations: [];        // 硬约束违反
    softViolations: [];        // 软约束违反
    overallSatisfaction: number;
  };
  isFeasible: boolean;         // 是否可行
}
```

## Abu 升级要点

### 旧版 Abu（规则引擎）
```typescript
// 布尔判断
if (demViolation === 'HARD') return 'REJECT';
if (accessibilityScore < 0.3) return 'REJECT';
return 'ALLOW';
```

### 新版 Abu（约束优化器）
```typescript
// 返回约束满足度
{
  isFeasible: boolean,           // 硬约束是否满足
  overallSatisfaction: 0.85,     // 整体满足度 (0-1)
  safetyScore: 0.72,             // 安全性分数 (0-1)
  hardConstraints: [...],        // 硬约束检查结果
  softConstraints: [...],        // 软约束检查结果
  riskHeatmap: [...],            // 风险热力图
  repairSuggestions: [...]       // 修复建议
}
```

## Dre 升级要点

### 旧版 Dre（启发式调整）
```typescript
// 贪心调整
if (fatigueIndex > 1.4) {
  return splitDay(plan, worstDay);
}
if (fatigueIndex > 1.1) {
  return insertBufferDay(plan, afterDay);
}
```

### 新版 Dre（时序优化器）
```typescript
// 多候选方案比较
const candidates = [
  { type: 'ORIGINAL', plan: original },
  { type: 'SPLIT_DAY', plan: splitPlan },
  { type: 'INSERT_BUFFER', plan: bufferPlan },
  { type: 'LOAD_BALANCE', plan: balancedPlan },
];

// 使用目标函数评估
for (const c of candidates) {
  c.evaluation = objectiveFunction.evaluate(c.plan, world);
}

// 选择效用最高的方案
return candidates.sort((a, b) => 
  b.evaluation.totalUtility - a.evaluation.totalUtility
)[0];
```

## 使用示例

### 基础用法

```typescript
import { StrategyOrchestratorV2Service } from './optimization';

// 注入服务
constructor(private orchestrator: StrategyOrchestratorV2Service) {}

// 执行编排
const result = await this.orchestrator.run(world, plan);

console.log(`效用: ${result.summary.finalUtility}`);
console.log(`改进: ${result.summary.improvementPct}%`);
console.log(`动作: ${result.finalAction}`);
```

### 快速评估

```typescript
const evaluation = await this.orchestrator.quickEvaluate(world, plan);

console.log(`效用: ${evaluation.utility}`);
console.log(`可行: ${evaluation.isFeasible}`);
console.log(`风险: ${evaluation.riskLevel}`);
```

### 方案比较

```typescript
const comparison = await this.orchestrator.comparePlans(world, [
  planA,
  planB,
  planC,
]);

console.log(`最优方案: ${comparison.bestIndex}`);
console.log(`排序: ${comparison.ranking}`);
```

## 与 Phase 2 的衔接

Phase 1 为 Phase 2 奠定基础：

| Phase 1 | Phase 2 |
|---------|---------|
| 固定权重 | 可学习权重（gradient descent） |
| 点估计 | 概率分布（Monte Carlo） |
| 规则约束 | 概率约束（soft thresholds） |
| 顺序执行 | 多智能体协商 |

### Phase 2 扩展点

1. **权重学习**
   ```typescript
   // Phase 2: 从反馈学习权重
   objectiveFunction.learnWeights(feedbackHistory);
   ```

2. **概率模型**
   ```typescript
   // Phase 2: 天气概率分布
   weatherDistribution: {
     type: 'GAUSSIAN',
     mean: 0.7,
     variance: 0.1
   }
   ```

3. **多智能体协商**
   ```typescript
   // Phase 2: 人格辩论
   const debate = await guardianDebate.negotiate(
     abuOpinion,
     dreOpinion,
     neptuneOpinion
   );
   ```

## 迁移指南

### 从旧版 Abu 迁移

```typescript
// 旧版
const result = await abuStrategy.evaluate(world, plan);
if (result.action === 'REJECT') { ... }

// 新版
const result = await abuOptimizer.optimizeConstraints({ plan, world });
if (!result.allowed) {
  // 可以获取详细的约束分析
  console.log(result.evaluation.repairSuggestions);
}
```

### 从旧版 Dre 迁移

```typescript
// 旧版
const result = await dreStrategy.evaluate(world, plan);

// 新版
const result = await dreOptimizer.optimizeSchedule(plan, world);
if (result.needsAdjustment) {
  // 可以看到所有候选方案
  console.log(result.allCandidates);
  // 使用推荐方案
  plan = result.recommendedCandidate.plan;
}
```

## 监控指标

建议监控以下指标：

1. **效用分布**
   - 平均效用
   - 效用标准差
   - 低效用（<0.5）比例

2. **约束满足度**
   - 硬约束违反率
   - 软约束违反分布
   - 常见违反类型

3. **优化效果**
   - 平均效用提升
   - 调整类型分布
   - 收敛速度

4. **决策置信度**
   - 平均置信度
   - 低置信度（<0.5）比例
   - 数据完整性影响

---

*Phase 1 完成后，系统从"有哲学的规则系统"升级为"有哲学的优化系统"。*
