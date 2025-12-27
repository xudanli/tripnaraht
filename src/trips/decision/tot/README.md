# ToT 评分器使用指南

## 概述

ToT (Tree of Thoughts) 评分器用于评估候选思路的质量，采用 **硬门控 + 软评分** 的两阶段设计。

## 快速开始

### 1.1 NestJS（推荐）

```typescript
// any.service.ts
import { Injectable } from '@nestjs/common';
import { ToTEvaluatorService } from './tot/tot-evaluator.service';
import { ThoughtInput } from './tot/tot-evaluator.interface';

@Injectable()
export class AnyService {
  constructor(private readonly evaluator: ToTEvaluatorService) {}

  async scoreCandidate(world: TripWorldState, plan: TripPlan) {
    const node: ThoughtInput = { world, plan };
    const result = await this.evaluator.evaluate(node);

    if (!result.allowed) return result;
    return result;
  }
}
```

**模块引入：**

```typescript
@Module({
  imports: [ToTEvaluatorModule],
  providers: [AnyService],
})
export class TripsDecisionModule {}
```

### 1.2 非 Nest 环境（测试/脚本/纯函数）

```typescript
import { createToTEvaluator } from './tot/tot-evaluator.factory';
import { ThoughtInput } from './tot/tot-evaluator.interface';

const evaluator = createToTEvaluator();

const node: ThoughtInput = {
  world: tripWorldState,
  plan: candidatePlan,
  optimizationResult,  // optional
  planningPolicy,      // optional
  planRequest,         // optional
};

const result = await evaluator.evaluate(node);
```

## 输入与输出

### 2.1 评分输入（最小）

```typescript
export interface ThoughtInput {
  world: TripWorldState;
  plan: TripPlan;

  // 可选：有则更准
  optimizationResult?: OptimizationResult;
  planningPolicy?: PlanningPolicy;
  planRequest?: PlanRequest;
}
```

### 2.2 搜索节点（ToT 扩展用）

```typescript
export interface ThoughtNode extends ThoughtInput {
  id: string;
  parentId?: string;
  depth: number;
  operator?: 'RD_ENUM' | 'DRDRE_SCHEDULE' | 'NEPTUNE_REPAIR' | 'MIXED';
  rationale?: string;
}
```

### 2.3 评分输出（统一结构）

```typescript
export interface ToTScoreResult {
  allowed: boolean;
  hardViolations: string[];

  score: number; // 0..100
  dims: { cost: number; risk: number; pref: number; time: number; req: number }; // 0..1
  weights: { cost: number; risk: number; pref: number; time: number; req: number }; // 归一化后

  metrics: Record<string, number | string | boolean | object>;
}
```

## 基本使用

```typescript
const node: ThoughtInput = {
  world: tripWorldState,
  plan: candidatePlan,
  optimizationResult,  // optional
  planningPolicy,      // optional
  planRequest,         // optional
};

const result = await evaluator.evaluate(node);

if (result.allowed) {
  console.log(`得分: ${result.score}/100`);
  console.log(`维度:`, result.dims);
  console.log(`权重:`, result.weights);
  console.log(`指标:`, result.metrics);
} else {
  console.log(`硬门控拒绝:`, result.hardViolations);
}
```

## 硬门控（Hard Gate）

以下情况直接淘汰：

### 硬节点不可行
- 硬节点闭馆 / 停业（`CLOSED_DAY`）
- 硬节点时间窗冲突（`TIME_WINDOW_CONFLICT`）
- 硬节点严重超时（`INSUFFICIENT_TOTAL_TIME` 且影响硬节点）

### 硬约束违反（PlanningPolicy.constraints）
- 轮椅可达、禁楼梯、换乘/步行上限、洗手间间隔等

### 空计划
- 没有任何活动节点（可按 day 维度判定）

**工程建议**：hard gate 里返回 `hardViolations` 必须是稳定枚举（方便统计/告警）。

## 五维度评分（Soft Score）

维度均归一化为 [0,1]，最终 `score = 100 * weightedMean(dims, weights)`：

- **S_cost**：预算利用率 + 超预算指数惩罚 + 时间价值折算
- **S_risk**：活动风险 + 时间窗紧张度 + 鲁棒性（buffer/slack）
- **S_pref**：意图匹配 + 质量/独特性 + 多样性惩罚 + dislike 扣分
- **S_time**：服务利用率 + 旅行/等待惩罚 + 关键窗口 slack
- **S_req**：硬节点覆盖率 + drop_penalty/ reward + priority保护

## 动态权重调整

权重依据以下因素动态调整并归一化：

- **pacing**（relaxed/normal/intense）
- **riskTolerance**（low/medium/high）
- **budget.style**（low/medium/high）
- **anchors/locked/hardNodeCount**（强制保障 w_req 下限）

**建议规则**：
- 有 anchors 或硬节点：`w_req >= 0.25`
- 硬节点数 ≥ 3：`w_req >= 0.35`

## Beam Search 集成示例（修正版）

```typescript
async function beamSearch(
  root: ThoughtNode,
  evaluator: ToTEvaluatorService,
  expand: (nodes: ThoughtNode[]) => Promise<ThoughtNode[]>,
  beamWidth = 4,
  maxDepth = 3,
): Promise<ThoughtNode[]> {
  let frontier: ThoughtNode[] = [root];

  for (let depth = 0; depth < maxDepth; depth++) {
    // 1) 评估本层候选
    const scored = await Promise.all(
      frontier.map(async (node) => ({ 
        node, 
        score: await evaluator.evaluate(node) 
      }))
    );

    // 2) 过滤 hard gate
    const allowed = scored.filter(x => x.score.allowed);

    // 3) 排序取 TopK
    allowed.sort((a, b) => b.score.score - a.score.score);
    const topK = allowed.slice(0, beamWidth).map(x => x.node);

    // 4) 扩展生成下一层
    frontier = await expand(topK);

    if (frontier.length === 0) break;
  }

  return frontier;
}
```

## 工具函数建议

### 时间计算
```typescript
import { parseTimeToMinutes, timeDiffMinutes, calculateDayDuration } from './tot/utils';

const minutes = parseTimeToMinutes('09:30'); // 570
const diff = timeDiffMinutes('09:00', '18:00'); // 540
const duration = calculateDayDuration('08:00', '22:00'); // 840
```

### 计划统计
```typescript
import { countActivities, countHardNodes, getHardNodeIds } from './tot/utils';

const activityCount = countActivities(plan);
const hardNodeCount = countHardNodes(plan);
const hardNodeIds = getHardNodeIds(plan);
```

### 旅行时间统计
```typescript
import { calculateTotalTravelTime, calculateTotalWalkTime } from './tot/utils';

const totalTravel = calculateTotalTravelTime(plan);
const totalWalk = calculateTotalWalkTime(plan);
```

### 预算比率计算（建议补充）
```typescript
function computeBudgetRatio(plan: TripPlan, ctx: TripContextState): number {
  const cost = plan.metrics?.estTotalCost ?? 0;
  const budget = ctx.budget?.amount ?? 0;
  return budget > 0 ? cost / budget : 0;
}
```

### 最小 Slack（建议补充）
```typescript
function minSlack(
  plan: TripPlan,
  optimizationResult?: OptimizationResult
): number {
  if (optimizationResult?.robustness?.top3_min_slack_nodes) {
    return Math.min(
      ...optimizationResult.robustness.top3_min_slack_nodes.map(n => n.slack_min)
    );
  }
  return 60; // 默认值
}
```

### 意图匹配（建议补充）
```typescript
function intentMatch(
  plan: TripPlan,
  userIntents: Record<string, number>,
  tagAffinity: Record<string, number>,
  dislikeTags: string[]
): number {
  // 实现逻辑...
  return 0.8; // 示例返回值
}
```

**注意**：所有工具函数都应该是纯函数，方便单测。

## 调参建议

### 快速调参流程

1. **查看日志**：识别哪一维压错了
2. **调整权重**：修改对应维度的权重
3. **调整阈值**：修改 `scoring-constants.ts` 中的阈值参数
4. **验证效果**：使用相同 seed 验证

### 常见调参场景

| 问题 | 调参方向 |
|------|---------|
| 成本超预算太多 | 增加 `w_cost` 或提高 `COST_CONSTANTS.OVER_BUDGET_PENALTY_K` |
| 风险太高 | 增加 `w_risk` 或降低风险容忍度倍数 |
| 偏好匹配差 | 增加 `w_pref` 或提高意图匹配权重 |
| 时间利用率低 | 增加 `w_time` 或调整利用率阈值 |
| 必达点丢失 | 增加 `w_req` 或提高硬节点保护权重 |

## 文件结构

```
src/trips/decision/tot/
├── tot-evaluator.interface.ts    # 接口定义（ThoughtInput/ThoughtNode）
├── tot-evaluator.service.ts      # 主评分器服务（NestJS）
├── tot-evaluator.factory.ts      # 工厂函数（非 Nest 环境）
├── score-result.ts                # ToTScoreResult 类型 + helpers
├── scoring-constants.ts          # 阈值/系数（k=4, slack=30, bufferHalfLife=60）
├── dimension-scorers.ts           # 五维度评分函数
├── weight-computer.ts             # 权重计算与动态调整
├── hard-gate.ts                   # 硬门控逻辑
├── candidate-helper.ts            # 候选活动查找辅助
├── utils.ts                       # 工具函数
├── tot-evaluator.module.ts        # NestJS 模块
├── README.md                      # 使用文档
└── __tests__/
    └── tot-evaluator.spec.ts     # 单元测试
```

## 注意事项

1. **候选池查找**：确保 `world.candidatesByDate` 包含完整的活动信息
2. **PlanningPolicy**：如果提供，会用于获取权重参数和硬约束检查
3. **PlanRequest**：如果提供，会用于获取目标权重配置
4. **优化结果**：如果提供，会用于获取更精确的时间统计和丢弃信息
5. **阈值调参**：所有阈值集中在 `scoring-constants.ts`，避免 service 文件被改得很乱

## 后续优化方向

1. 完善 PlanningPolicy 硬约束检查（需要更多元数据）
2. 从优化结果中提取 PlanRequest 信息
3. 支持并行评估以提高性能
4. 添加缓存机制避免重复计算
