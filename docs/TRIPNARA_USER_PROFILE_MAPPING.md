# TripNARA User Profile → Decision Params 映射体系

## 概述

这是 TripNARA Agent 的**核心能力**：将"懂用户"从感性判断转化为工程可执行的规则层。

**核心原则**：
- 不依赖 prompt 玄学
- 不写死国家
- 可扩展、可学习、可回溯
- 直接作用于 RouteDirection / 决策引擎 / DEM 约束

## 架构设计

```
UserTravelProfile (用户画像)
    ↓
UserProfileMapperService (映射服务)
    ↓
DecisionParams (决策参数)
    ↓
DecisionParamsInjectorService (注入服务)
    ↓
RouteDirectionSelectorService + TripDecisionEngineService (决策引擎)
```

## 一、用户画像结构 (UserTravelProfile)

```typescript
interface UserTravelProfile {
  userId: string;
  pacePreference?: "SLOW" | "MODERATE" | "FAST";
  altitudeTolerance?: "LOW" | "MEDIUM" | "HIGH";
  riskTolerance?: "LOW" | "MEDIUM" | "HIGH";
  travelPhilosophy?: "SCENIC" | "ADVENTURE" | "RELAXED";
  preferredRouteTypes?: RouteType[];
  confidence: number; // 0~1，学习置信度
  source: 'explicit' | 'inferred' | 'mixed';
  updatedAt: Date;
}
```

## 二、决策参数结构 (DecisionParams)

```typescript
interface DecisionParams {
  // RouteDirection 层权重
  routeDirectionBias: {
    difficultyWeight: number;    // 难度权重
    sceneryWeight: number;        // 风景权重
    adventureWeight: number;      // 冒险权重
    stabilityWeight: number;      // 稳定性权重
  };

  // 约束层（DEM / 地形 / 节奏）
  constraints: {
    maxDailyAscentM?: number;     // 每日最大爬升（米）
    maxElevationM?: number;       // 最大海拔（米）
    maxSlopePct?: number;         // 最大坡度（百分比）
    bufferTimeMin?: number;       // 缓冲时间（分钟）
    avoidRapidAscent?: boolean;   // 是否避免快速上升
  };

  // 策略偏好权重
  strategyPreference: {
    abuWeight: number;           // Abu 策略权重（保守）
    drDreWeight: number;          // Dr.Dre 策略权重（结构调整）
    neptuneWeight: number;        // Neptune 策略权重（修复）
  };

  // 修复倾向
  repairPolicy: {
    preferSplitDays: boolean;      // 优先拆天
    preferAltRoute: boolean;      // 优先替代路线
    preferRestDay: boolean;       // 优先休息日
  };
}
```

**关键点**：`UserTravelProfile` 不直接进决策引擎，`DecisionParams` 才进。

## 三、映射规则详解

### 1️⃣ Pace → 节奏 & 策略

| Pace | 影响 |
|------|------|
| SLOW | 加 buffer、拆天、优先休息 |
| MODERATE | 保持平衡 |
| FAST | 压缩天数、允许高强度 |

**实现**：
```typescript
if (pace === "SLOW") {
  constraints.bufferTimeMin += 60 * confidenceMultiplier;
  strategyPreference.abuWeight += 0.2 * confidenceMultiplier;
  repairPolicy.preferRestDay = true;
  repairPolicy.preferSplitDays = true;
}
```

### 2️⃣ AltitudeTolerance → DEM 硬约束

| Altitude | 影响 |
|----------|------|
| LOW | 禁止高海拔（maxElevationM = 3500m） |
| MEDIUM | 允许但需适应（maxElevationM = 4500m） |
| HIGH | 放宽限制（maxElevationM = 6000m） |

**实现**：
```typescript
if (altitudeTolerance === "LOW") {
  constraints.maxElevationM = 3500;
  constraints.avoidRapidAscent = true;
  constraints.maxDailyAscentM = 500 * confidenceMultiplier;
}
```

### 3️⃣ RiskTolerance → RouteDirection & 策略

| Risk | 行为 |
|------|------|
| LOW | 强烈偏向稳定路线 |
| MEDIUM | 保持平衡 |
| HIGH | 接受边缘路线 |

**实现**：
```typescript
if (riskTolerance === "LOW") {
  routeDirectionBias.stabilityWeight += 0.3 * confidenceMultiplier;
  strategyPreference.abuWeight += 0.3 * confidenceMultiplier;
  repairPolicy.preferAltRoute = true;
}
```

### 4️⃣ TravelPhilosophy → 目标函数权重

| Philosophy | 权重变化 |
|------------|----------|
| SCENIC | preferViewpoints（sceneryWeight += 0.4） |
| ADVENTURE | preferChallenge（adventureWeight += 0.4） |
| RELAXED | preferHotSpring / Rest（stabilityWeight += 0.3） |

**实现**：
```typescript
if (travelPhilosophy === "SCENIC") {
  routeDirectionBias.sceneryWeight += 0.4 * confidenceMultiplier;
  routeDirectionBias.difficultyWeight -= 0.2 * confidenceMultiplier;
}
```

### 5️⃣ PreferredRouteTypes → RouteDirection 过滤

**规则**：如果不在偏好列表中，降权到 60%，但不直接禁止。

**实现**：
```typescript
if (!preferredRouteTypes.includes(rd.routeType)) {
  rd.score *= 0.6; // 不直接禁，但强烈降权
}
```

## 四、学习机制（置信度调整）

**核心规则**：
- `confidence < 0.5` 时：参数变化幅度缩小（multiplier = 0.5），避免误判
- 行程成功后：`confidence += 0.05`，参数影响增强

**实现**：
```typescript
const confidenceMultiplier = profile.confidence < 0.5 ? 0.5 : 1.0;
```

## 五、集成点

### 1. RouteDirectionSelectorService

**位置**：`src/route-directions/services/route-direction-selector.service.ts`

**功能**：
- 使用 `routeDirectionBias` 调整 RouteDirection 评分
- 使用 `preferredRouteTypes` 过滤/降权 RouteDirection
- 结合 `RouteDirectionHealth` 进行健康度调整

**代码示例**：
```typescript
// 获取决策参数
const decisionParams = await this.decisionParamsInjector.getDecisionParamsForUser(userId);

// 调整评分
finalScore = await this.decisionParamsInjector.adjustRouteDirectionScore(
  rd.id,
  countryCode,
  baseScore,
  decisionParams,
  rd
);
```

### 2. TripDecisionEngineService

**位置**：`src/trips/decision/trip-decision-engine.service.ts`

**功能**：
- 使用 `injectConstraintsToWorldModel` 注入 DEM / 节奏约束
- 策略权重用于未来扩展（当前 Abu/Dr.Dre/Neptune 是固定顺序）
- 修复策略（`repairPolicy`）影响 Neptune 修复行为

**代码示例**：
```typescript
// 获取决策参数
const decisionParams = await this.decisionParamsInjector.getDecisionParamsForUser(userId);

// 注入约束
this.decisionParamsInjector.injectConstraintsToWorldModel(state, decisionParams);

// Dry-run 使用决策参数
const dryRunResult = await this.dryRunPlanner.simulatePlan(state, plan, decisionParams);
```

### 3. DecisionParamsInjectorService

**位置**：`src/agent/memory/services/decision-params-injector.service.ts`

**核心方法**：
- `getDecisionParamsForUser(userId)`: 获取用户的决策参数
- `adjustRouteDirectionScore(...)`: 调整 RouteDirection 评分
- `injectConstraintsToWorldModel(...)`: 注入约束到 world model
- `filterRouteDirectionByPreference(...)`: 根据偏好过滤 RouteDirection

## 六、实际能力示例

### 示例 1：不适合高海拔的用户

**用户画像**：
```typescript
{
  altitudeTolerance: "LOW",
  confidence: 0.8
}
```

**映射结果**：
```typescript
{
  constraints: {
    maxElevationM: 3500,
    avoidRapidAscent: true,
    maxDailyAscentM: 500
  }
}
```

**效果**：Agent 会自动排除 EBC、K2 等高海拔路线，或降级为低海拔替代方案。

### 示例 2：爱风景但怕累的用户

**用户画像**：
```typescript
{
  pacePreference: "SLOW",
  travelPhilosophy: "SCENIC",
  confidence: 0.7
}
```

**映射结果**：
```typescript
{
  routeDirectionBias: {
    sceneryWeight: 0.9,  // 高风景权重
    difficultyWeight: 0.3  // 低难度权重
  },
  constraints: {
    bufferTimeMin: 75  // 增加缓冲时间
  },
  strategyPreference: {
    abuWeight: 0.53  // 偏向保守策略
  },
  repairPolicy: {
    preferRestDay: true,
    preferSplitDays: true
  }
}
```

**效果**：Agent 会选择风景优美但节奏缓慢的路线，自动拆天、增加休息日。

## 七、使用流程

### 1. 创建/更新用户画像

```typescript
const profile: UserTravelProfile = {
  userId: "user123",
  pacePreference: "SLOW",
  altitudeTolerance: "LOW",
  riskTolerance: "LOW",
  travelPhilosophy: "SCENIC",
  preferredRouteTypes: ["HIKING", "NATURE"],
  confidence: 0.5,
  source: "explicit",
  updatedAt: new Date()
};

await memoryService.saveUserTravelProfile(profile);
```

### 2. 在决策引擎中使用

```typescript
// 在 RouteDirectionSelectorService 中
const decisionParams = await decisionParamsInjector.getDecisionParamsForUser(userId);
const adjustedScore = await decisionParamsInjector.adjustRouteDirectionScore(
  routeDirectionId,
  countryCode,
  baseScore,
  decisionParams,
  routeDirection
);

// 在 TripDecisionEngineService 中
const decisionParams = await decisionParamsInjector.getDecisionParamsForUser(userId);
decisionParamsInjector.injectConstraintsToWorldModel(state, decisionParams);
```

### 3. 学习与更新

```typescript
// 行程成功后，更新置信度
const profile = await memoryService.getUserTravelProfile(userId);
profile.confidence = Math.min(1.0, profile.confidence + 0.05);
await memoryService.saveUserTravelProfile(profile);
```

## 八、文件结构

```
src/agent/memory/
├── interfaces/
│   ├── user-travel-profile.interface.ts      # UserTravelProfile 定义
│   └── decision-params.interface.ts          # DecisionParams 定义
├── services/
│   ├── user-profile-mapper.service.ts        # 映射逻辑
│   ├── decision-params-injector.service.ts   # 注入服务
│   └── memory.service.ts                     # 内存服务（包含 CRUD）
└── memory.module.ts                           # 模块定义
```

## 九、测试验证

### 测试映射逻辑

```typescript
const mapper = new UserProfileMapperService();
const profile: UserTravelProfile = {
  userId: "test",
  pacePreference: "SLOW",
  altitudeTolerance: "LOW",
  riskTolerance: "LOW",
  travelPhilosophy: "SCENIC",
  confidence: 0.8
};

const params = mapper.mapUserProfileToDecisionParams(profile);
// 验证 params.constraints.maxElevationM === 3500
// 验证 params.constraints.bufferTimeMin >= 60
// 验证 params.routeDirectionBias.sceneryWeight > 0.5
```

### 测试集成点

```typescript
// 测试 RouteDirectionSelectorService 集成
const recommendations = await routeDirectionSelector.pickRouteDirections(
  userIntent,
  "NO",  // 挪威
  7,     // 7月
  requestId
);
// 验证推荐结果符合用户偏好
```

## 十、未来扩展

1. **策略权重动态选择**：根据 `strategyPreference` 动态选择执行顺序
2. **多用户合并**：使用 `mergeDecisionParams` 处理多人旅行
3. **实时学习**：根据用户反馈实时调整参数
4. **A/B 测试**：对比不同映射规则的效果

## 总结

这个映射体系实现了：

✅ **把"这个人不适合 EBC"** → `maxElevationM = 3500` + `strategyPreference.abuWeight += 0.3`

✅ **把"这个人爱风景但怕累"** → `sceneryWeight += 0.4` + `bufferTimeMin += 60` + `preferSplitDays = true`

✅ **不依赖 prompt 玄学**：所有规则都是代码可执行的

✅ **可学习、可回溯**：通过 `confidence` 和 `source` 追踪学习过程
