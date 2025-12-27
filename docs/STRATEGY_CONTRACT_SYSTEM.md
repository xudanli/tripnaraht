# Strategy Contract System（策略契约系统）

## 概述

三人格正式沉淀成 Strategy 契约（interface + 约束规范 + 生命周期钩子），方便直接集成进 TripDecisionEngine。

## 核心设计

### 总体设计目标

- 每个决策人格是一个**独立策略（Strategy）**
- 统一输入：WorldModel + RoutePlanDraft
- 统一输出：DecisionResult
- 每个策略都产出 DecisionEvidence + DecisionLog
- 保证调用顺序：**Abu → Dr.Dre → Neptune → Finalize**

## 核心类型

### WorldModelContext

```typescript
{
  countryCode: string;
  month: number;
  decisionParams: DecisionParams;
  demEvidence: DemDecisionEvidence[];
  weatherEvidence?: WeatherEvidence[];
  complianceEvidence?: ComplianceEvidence[];
}
```

### RoutePlanDraft

```typescript
{
  tripId: string;
  routeDirectionId: string;
  segments: RouteSegment[];
}
```

### DecisionResult

```typescript
{
  allowed: boolean;
  action: "ALLOW" | "REJECT" | "ADJUST" | "REPLACE";
  updatedPlan?: RoutePlanDraft;
  logs: DecisionLogEntry[];
}
```

## Strategy Contract

### DecisionPersonaStrategy Interface

```typescript
interface DecisionPersonaStrategy {
  readonly personaName: "ABU" | "DR_DRE" | "NEPTUNE";
  
  evaluate(
    world: WorldModelContext,
    plan: RoutePlanDraft
  ): Promise<DecisionResult>;
}
```

## 三人格策略实现

### 🧠 Abu Strategy（安全否决者）

**法律：Abu 只能做两种事**
- ✔ ALLOW
- ✔ REJECT
- ❌ 不可 ADJUST / REPLACE

**职责：**
1. 检查 DEM 证据是否存在
2. 检查硬违规（HARD violation）
3. 只能 ALLOW 或 REJECT

**实现文件：** `src/trips/decision/strategies/abu-strategy.service.ts`

### 🛠 Dr.Dre Strategy（结构修复者）

**法律：**
- ✔ 可以 ADJUST
- ❌ 不得 REPLACE
- ❌ 不得覆盖硬约束

**职责：**
1. 检测连续疲劳（rolling window 3天）
2. 调整节奏（拆天、插入缓冲日）
3. 只能 ADJUST，不能 REPLACE

**实现文件：** `src/trips/decision/strategies/dr-dre-strategy.service.ts`

### 🌌 Neptune Strategy（空间修复者）

**法律：**
- ✔ 可以 REPLACE
- ❌ 不得忽略硬约束
- ❌ 不得改变 RouteDirection 哲学

**职责：**
1. 检测被阻塞或不可用的路段
2. 在同一走廊内替换入口点或局部路段
3. 保持 RouteDirection 哲学不变

**实现文件：** `src/trips/decision/strategies/neptune-strategy.service.ts`

## Strategy Orchestrator

### 策略编排服务

**文件：** `src/trips/decision/services/strategy-orchestrator.service.ts`

**调用顺序：**
```
Abu → Dr.Dre → Neptune → Finalize
```

**行为：**
- 如果 Abu 拒绝，立即停止，不执行后续策略
- 如果 Dr.Dre 调整了计划，将调整后的计划传递给 Neptune
- 如果 Neptune 替换了计划，使用替换后的计划作为最终结果

## 使用示例

### 基本使用

```typescript
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { WorldModelContext, RoutePlanDraft } from './shared/world-model.types';

@Injectable()
export class YourService {
  constructor(
    private readonly orchestrator: StrategyOrchestratorService
  ) {}

  async evaluatePlan(world: WorldModelContext, plan: RoutePlanDraft) {
    const result = await this.orchestrator.run(world, plan);
    
    if (!result.allowed) {
      // 计划被拒绝
      console.log('计划被拒绝:', result.logs[0].explanation);
      return null;
    }
    
    // 计划通过，可能被调整或替换
    return result.plan;
  }
}
```

### 单独使用某个策略

```typescript
import { AbuStrategy } from './strategies/abu-strategy.service';

@Injectable()
export class YourService {
  constructor(
    private readonly abu: AbuStrategy
  ) {}

  async checkSafety(world: WorldModelContext, plan: RoutePlanDraft) {
    const result = await this.abu.evaluate(world, plan);
    return result.allowed;
  }
}
```

## 测试场景

### 建议测试方向

1. **无 DEM → Abu 必 reject**
   ```typescript
   world.demEvidence = [];
   // 预期：result.allowed = false, action = "REJECT"
   ```

2. **Hard Risk → Abu reject**
   ```typescript
   world.demEvidence = [{ violation: "HARD", ... }];
   // 预期：result.allowed = false, action = "REJECT"
   ```

3. **Rolling Fatigue → Dr.Dre adjust**
   ```typescript
   // 3天累计爬升超过阈值
   // 预期：result.action = "ADJUST", updatedPlan 包含缓冲日
   ```

4. **Entrance blocked → Neptune replace**
   ```typescript
   world.weatherEvidence = [{ segmentId: "entry", violation: "HARD" }];
   // 预期：result.action = "REPLACE", updatedPlan 包含替代入口
   ```

5. **全部安全 → Allow**
   ```typescript
   // 所有证据都是 NONE
   // 预期：result.allowed = true, action = "ALLOW"
   ```

## 集成到 TripDecisionEngine

### 当前状态

策略契约系统已创建，可以：
1. 独立使用三个策略
2. 通过 StrategyOrchestratorService 编排执行
3. 与现有的 TripDecisionEngineService 集成

### 后续集成步骤

1. 在 `TripDecisionEngineService.generatePlan` 中调用 `StrategyOrchestratorService`
2. 将 `TripWorldState` 转换为 `WorldModelContext`
3. 将 `TripPlan` 转换为 `RoutePlanDraft`
4. 将 `DecisionResult` 转换回 `TripPlan`

## 文件结构

```
src/trips/decision/
├── shared/
│   ├── world-model.types.ts          # 世界模型类型
│   └── decision-result.types.ts      # 决策结果类型
├── strategies/
│   ├── decision-persona-strategy.interface.ts  # 策略接口
│   ├── abu-strategy.service.ts       # Abu 策略
│   ├── dr-dre-strategy.service.ts    # Dr.Dre 策略
│   ├── neptune-strategy.service.ts   # Neptune 策略
│   └── __tests__/
│       └── strategy-contract.spec.ts # 策略契约测试
└── services/
    └── strategy-orchestrator.service.ts  # 策略编排服务
```

## 约束规范

### Abu 约束
- ✅ 只能 ALLOW 或 REJECT
- ❌ 不能 ADJUST 或 REPLACE
- ✅ 必须检查 DEM 证据
- ✅ 必须检查硬违规

### Dr.Dre 约束
- ✅ 可以 ADJUST
- ❌ 不能 REPLACE
- ❌ 不能覆盖硬约束
- ✅ 必须检测连续疲劳

### Neptune 约束
- ✅ 可以 REPLACE
- ❌ 不能忽略硬约束
- ❌ 不能改变 RouteDirection 哲学
- ✅ 必须在同一走廊内替换

## 相关文档

- [Decision Log System](./DECISION_LOG_SYSTEM.md)
- [User Persona Mapping](./USER_PERSONA_MAPPING.md)
- [DEM Decision Evidence](./DEM_DECISION_EVIDENCE.md)

