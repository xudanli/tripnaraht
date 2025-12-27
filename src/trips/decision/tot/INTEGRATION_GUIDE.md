# ToT 评分器集成指南

## MVP 状态

✅ **已完成**：评分器 MVP 可以在没有 `optimizationResult` / `planningPolicy` / `planRequest` 的情况下返回稳定结果。

所有阈值和系数已集中在 `scoring-constants.ts`，所有硬编码值已替换为常量。

## 快速验证

```typescript
import { ToTEvaluatorService } from './tot/tot-evaluator.service';
import { ThoughtInput } from './tot/tot-evaluator.interface';

const evaluator = new ToTEvaluatorService();

// 最小输入：只需要 world 和 plan
const result = await evaluator.evaluate({
  world: tripWorldState,
  plan: candidatePlan,
});

console.log(`得分: ${result.score}/100`);
console.log(`各维度:`, result.dims);
console.log(`权重:`, result.weights);
console.log(`指标:`, result.metrics);
```

## 集成到 StrategyOrchestrator

### 方案 1：简单场景（保持现有流程）

```typescript
// 简单场景：继续 Abu → DrDre → Neptune
async run(world: WorldModelContext, plan: RoutePlanDraft) {
  // ... 现有逻辑 ...
}
```

### 方案 2：复杂场景（使用 ToT 选择最优候选）

```typescript
import { ToTEvaluatorService } from '../tot/tot-evaluator.service';
import { BeamSearchService } from '../tot/beam-search.service';
import { ThoughtNode } from '../tot/tot-evaluator.interface';
import { convertRoutePlanDraftToTripPlan } from '../tot/plan-converter';

@Injectable()
export class StrategyOrchestratorService {
  constructor(
    private readonly abu: AbuStrategy,
    private readonly dre: DrDreStrategy,
    private readonly nep: NeptuneStrategy,
    private readonly totEvaluator: ToTEvaluatorService,  // 新增
    private readonly beamSearch: BeamSearchService,      // 新增
  ) {}

  async run(
    world: WorldModelContext,
    plan: RoutePlanDraft,
    options?: { useToT?: boolean }  // 新增开关
  ): Promise<StrategyOrchestrationResult> {
    // ... Abu 和 DrDre 逻辑保持不变 ...

    // 3️⃣ Neptune 评估（空间修复者）
    if (options?.useToT) {
      // 复杂场景：生成多个候选，用 ToT 选择最优
      return await this.runWithToT(world, currentPlan);
    } else {
      // 简单场景：继续现有流程
      const nepResult = await this.nep.evaluate(world, currentPlan);
      // ... 现有逻辑 ...
    }
  }

  /**
   * 使用 ToT 选择最优候选
   */
  private async runWithToT(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<StrategyOrchestrationResult> {
    // 1. 检测空间问题
    const spatialIssues = await this.detectSpatialIssues(world, plan);
    
    if (spatialIssues.length === 0) {
      // 没有问题，直接返回
      return { plan, logs: [], allowed: true, finalAction: 'ALLOW' };
    }

    // 2. 为每个问题生成多个替换候选（例如 3 个）
    const candidates = await this.generateNeptuneCandidates(world, plan, spatialIssues);
    
    if (candidates.length === 0) {
      // 没有候选，使用 Neptune 的默认逻辑
      return await this.runDefaultNeptune(world, plan);
    }

    // 3. 转换为 ThoughtNode
    const worldState = this.convertToTripWorldState(world);
    const tripPlan = convertRoutePlanDraftToTripPlan(plan, worldState);
    
    const root: ThoughtNode = {
      id: 'root',
      depth: 0,
      world: worldState,
      plan: tripPlan,
    };

    // 4. 使用 Beam Search 选择最优
    const result = await this.beamSearch.search(
      root,
      async (nodes) => {
        // 扩展函数：为每个节点生成候选
        const expanded: ThoughtNode[] = [];
        for (const node of nodes) {
          const nodeCandidates = await this.beamSearch.expandFromNeptuneCandidates(
            node,
            candidates.map(c => ({ plan: c.plan, explanation: c.explanation }))
          );
          expanded.push(...nodeCandidates);
        }
        return expanded;
      },
      { beamWidth: 3, maxDepth: 1, timeBudgetMs: 1000 }
    );

    if (!result.best) {
      // 所有候选被拒绝，回退到默认逻辑
      return await this.runDefaultNeptune(world, plan);
    }

    // 5. 转换回 RoutePlanDraft（简化处理）
    const bestPlan = this.convertTripPlanToRoutePlanDraft(result.best.plan, plan);

    return {
      plan: bestPlan,
      logs: [{
        persona: 'NEPTUNE',
        action: 'REPLACE',
        explanation: `使用 ToT 从 ${candidates.length} 个候选中选择最优方案（得分: ${result.bestScore}/100）`,
        reasonCodes: ['TOT_SELECTED'],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
      }],
      allowed: true,
      finalAction: 'REPLACE',
    };
  }

  // Helper methods (需要实现)
  private async detectSpatialIssues(world: WorldModelContext, plan: RoutePlanDraft) {
    // 使用 SpatialIssueDetectorService
    return [];
  }

  private async generateNeptuneCandidates(world: WorldModelContext, plan: RoutePlanDraft, issues: any[]) {
    // 为每个问题生成 3 个替换候选
    return [];
  }

  private convertToTripWorldState(world: WorldModelContext): TripWorldState {
    // 转换逻辑
    return {} as TripWorldState;
  }

  private convertTripPlanToRoutePlanDraft(plan: TripPlan, original: RoutePlanDraft): RoutePlanDraft {
    // 转换逻辑
    return original;
  }

  private async runDefaultNeptune(world: WorldModelContext, plan: RoutePlanDraft) {
    // 回退到默认 Neptune 逻辑
    const nepResult = await this.nep.evaluate(world, plan);
    return {
      plan: nepResult.updatedPlan || plan,
      logs: nepResult.logs,
      allowed: nepResult.allowed,
      finalAction: nepResult.action as any,
    };
  }
}
```

## 使用示例

### 简单场景（默认）

```typescript
const result = await orchestrator.run(world, plan);
// 继续使用现有流程：Abu → DrDre → Neptune
```

### 复杂场景（启用 ToT）

```typescript
const result = await orchestrator.run(world, plan, { useToT: true });
// 在 Neptune 阶段使用 ToT 选择最优候选
```

## 测试验证

运行黄金单测验证 MVP：

```bash
npm run test -- src/trips/decision/tot/__tests__/tot-evaluator.golden.spec.ts
```

所有 9 个测试应该通过，验证：
- ✅ Baseline 可行
- ✅ 超预算惩罚
- ✅ 低风险容忍度调整
- ✅ 时间窗紧张度
- ✅ 必达点保护
- ✅ 多样性惩罚

## 下一步

1. **完善转换逻辑**：实现 `convertRoutePlanDraftToTripPlan` 和 `convertTripPlanToRoutePlanDraft`
2. **集成真实数据源**：接入 `optimizationResult` 获取更精确的时间统计
3. **扩展候选生成**：完善 `generateNeptuneCandidates` 生成多个替换方案
4. **性能优化**：对于大量候选，考虑并行评估

