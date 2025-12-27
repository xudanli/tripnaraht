# TripNARA Agent Memory System（记忆层系统）

## 概述

TripNARA Agent Memory System 是让 Agent 从"一次次聪明"变成"长期稳定聪明"的关键系统。

它通过四层记忆结构，让 Agent 能够：
- **记住人**：用户的旅行人格和偏好
- **记住路**：哪些路线常成功、哪些常失败
- **记住决策**：为什么选择这条路线
- **记住反馈**：计划是否成功、用户是否满意

## 记忆分层架构

### L1: 用户旅行人格（UserTravelProfile）

**记住什么**：用户是谁  
**生命周期**：跨年  
**作用**：决策基线

```typescript
interface UserTravelProfile {
  userId: string;
  pacePreference: 'SLOW' | 'MODERATE' | 'FAST';
  altitudeTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  travelPhilosophy: 'SCENIC' | 'ADVENTURE' | 'RELAXED';
  preferredRouteTypes: RouteType[];
  confidence: number; // 0~1，学习置信度
  source: 'explicit' | 'inferred' | 'mixed';
}
```

**写入规则**：
- 用户明确表达 → 直接写（confidence = 0.8）
- 多次行为一致 → 推断写（confidence += 0.1）
- 行程被频繁拆天 → pace -= 1

**读取时机**：
- RouteDirectionSelectorService 评分前
- TripDecisionEngineService 约束注入前

### L2: 路线决策记忆（RouteDirectionDecisionMemory）

**记住什么**：这次为什么这么选  
**生命周期**：单次旅程  
**作用**：可解释

```typescript
interface RouteDirectionDecisionMemory {
  userId: string;
  tripId?: string;
  countryCode: string;
  month: number;
  selectedRouteDirectionId: number;
  rejectedRouteDirectionIds: number[];
  keyConstraints: Record<string, any>;
  scoreBreakdown: Record<string, any>;
  explanation: {
    whySelected: string;
    whyRejected: Array<{ id: number; reason: string }>;
    riskPoints: string[];
  };
}
```

**写入规则**：
- 每次生成计划时 **必须写**
- 决策引擎输出后统一写入

**读取用途**：
- 用户追问"为什么不是另一条？"
- 回溯 bug / 误选

### L3: 路线健康记忆（RouteDirectionHealth）

**记住什么**：哪些路线常失败  
**生命周期**：全局  
**作用**：纠偏

```typescript
interface RouteDirectionHealth {
  routeDirectionId: number;
  countryCode: string;
  totalRuns: number;
  successRuns: number;
  failureRuns: number;
  commonFailureReasons: string[];
  commonRepairs: string[];
}
```

**写入规则**：
- 每次旅程结束 or 模拟评估
- Neptune 触发修复 → 记录 repair

**使用方式**：
- RouteDirectionSelectorService 中：高失败率 → score -=
- 高频修复 → 提前加 buffer

### L4: 行为反馈记忆（TripOutcomeFeedback）

**记住什么**：计划是否成功  
**生命周期**：跨旅程  
**作用**：学习

```typescript
interface TripOutcomeFeedback {
  tripId: string;
  userId: string;
  overallSuccess: boolean;
  fatigueLevel?: number; // 1~5
  satisfaction?: number; // 1~5
  abandoned: boolean;
  failurePoints: string[];
}
```

**写入来源**：
- 用户反馈
- 行程被中断
- 规则模拟失败

**用途**：
- 更新 UserTravelProfile
- 更新 RouteDirectionHealth

## 用户画像 → 决策参数映射

### 核心思想

这不是「标签 → if else」，而是：

**用户人格 → 决策空间的"形状"**

用户不是决定去哪，而是决定：
- 能承受多累
- 能接受多险
- 愿不愿意为体验付出成本

### 映射规则

#### 1. Pace → 节奏 & 策略

| Pace | 影响 |
|------|------|
| SLOW | 加 buffer、拆天、优先休息 |
| MODERATE | 平衡 |
| FAST | 压缩天数、允许高强度 |

#### 2. AltitudeTolerance → DEM 硬约束

| Altitude | 影响 |
|----------|------|
| LOW | 禁止高海拔（maxElevationM = 3500） |
| MEDIUM | 允许但需适应（maxElevationM = 4500） |
| HIGH | 放宽（maxElevationM = 6000） |

#### 3. RiskTolerance → RouteDirection & 策略

| Risk | 行为 |
|------|------|
| LOW | 强烈偏向稳定路线（stabilityWeight += 0.3） |
| MEDIUM | 平衡 |
| HIGH | 接受边缘路线（adventureWeight += 0.3） |

#### 4. TravelPhilosophy → 目标函数权重

| Philosophy | 权重变化 |
|------------|----------|
| SCENIC | sceneryWeight += 0.4 |
| ADVENTURE | adventureWeight += 0.4 |
| RELAXED | stabilityWeight += 0.3 |

## 集成点

### 1. RouteDirectionSelectorService

```typescript
// 在评分前读取用户画像
const decisionParams = await decisionParamsInjector.getDecisionParamsForUser(userId);

// 调整评分
const adjustedScore = await decisionParamsInjector.adjustRouteDirectionScore(
  routeDirectionId,
  countryCode,
  baseScore,
  decisionParams
);
```

### 2. TripDecisionEngineService

```typescript
// 在生成计划前读取用户画像
const decisionParams = await decisionParamsInjector.getDecisionParamsForUser(userId);

// 注入约束
decisionParamsInjector.injectConstraintsToWorldModel(state, decisionParams);
```

### 3. 决策后保存记忆

```typescript
// 保存路线决策记忆
await memoryService.saveRouteDirectionDecision({
  userId,
  tripId,
  countryCode,
  month,
  selectedRouteDirectionId,
  rejectedRouteDirectionIds,
  keyConstraints,
  scoreBreakdown,
  explanation,
});
```

### 4. 行程结束后学习

```typescript
// 保存反馈
await memoryService.saveTripOutcomeFeedback({
  tripId,
  userId,
  overallSuccess,
  fatigueLevel,
  satisfaction,
  abandoned,
  failurePoints,
});

// 自动触发学习更新（在 MemoryService 中实现）
```

## 与现有系统的关系

| 模块 | 作用 |
|------|------|
| DecisionLog | 单次决策过程 |
| Memory | 跨时间经验 |
| RouteDirection | 世界观 |
| Strategy | 执行方式 |

**Memory 是 Decision 的"长期存档"**

## 使用示例

### 示例 1：新用户首次规划

```typescript
// 1. 读取用户画像（不存在，返回默认值）
const profile = await memoryService.getUserTravelProfile(userId);
// profile = { pacePreference: 'MODERATE', confidence: 0.3, ... }

// 2. 映射为决策参数
const decisionParams = profileMapper.mapUserProfileToDecisionParams(profile);

// 3. 在 RouteDirection 选择时应用
const recommendations = await routeSelector.pickRouteDirections(...);
// 使用 decisionParams 调整评分

// 4. 在决策引擎中注入约束
decisionParamsInjector.injectConstraintsToWorldModel(state, decisionParams);
```

### 示例 2：用户反馈后学习

```typescript
// 用户反馈：太累了
await memoryService.saveTripOutcomeFeedback({
  tripId,
  userId,
  overallSuccess: true,
  fatigueLevel: 5, // 很累
  satisfaction: 3,
  abandoned: false,
});

// 自动学习：降低 pace
// MemoryService.learnFromFeedback() 会自动：
// - 如果 fatigueLevel >= 4，pacePreference 降级
// - confidence += 0.05
```

### 示例 3：路线健康度影响选择

```typescript
// 查询路线健康度
const health = await memoryService.getRouteDirectionHealth(routeDirectionId, countryCode);
// health = { totalRuns: 10, successRuns: 3, failureRuns: 7, ... }

// 计算健康度分数
const healthScore = calculateRouteDirectionHealthScore(health);
// healthScore = 0.2 (很低)

// 在评分时应用
const adjustedScore = baseScore * (0.5 + healthScore * 0.5);
// 低健康度路线会被降分
```

## 数据库 Schema（参考）

```sql
-- L1: 用户旅行人格
CREATE TABLE user_travel_profile (
  user_id UUID PRIMARY KEY,
  pace_preference TEXT,
  altitude_tolerance TEXT,
  risk_tolerance TEXT,
  travel_philosophy TEXT,
  preferred_route_types TEXT[],
  confidence FLOAT DEFAULT 0.5,
  source TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

-- L2: 路线决策记忆
CREATE TABLE route_direction_decision (
  id UUID PRIMARY KEY,
  user_id UUID,
  trip_id UUID,
  country_code TEXT,
  month INT,
  selected_route_direction_id INT,
  rejected_route_direction_ids INT[],
  key_constraints JSONB,
  score_breakdown JSONB,
  explanation JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- L3: 路线健康记忆
CREATE TABLE route_direction_health (
  route_direction_id INT,
  country_code TEXT,
  total_runs INT DEFAULT 0,
  success_runs INT DEFAULT 0,
  failure_runs INT DEFAULT 0,
  common_failure_reasons TEXT[],
  common_repairs TEXT[],
  last_updated TIMESTAMP DEFAULT now(),
  PRIMARY KEY (route_direction_id, country_code)
);

-- L4: 行为反馈记忆
CREATE TABLE trip_outcome_feedback (
  trip_id UUID PRIMARY KEY,
  user_id UUID,
  overall_success BOOLEAN,
  fatigue_level INT,
  satisfaction INT,
  abandoned BOOLEAN,
  failure_points TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

## 注意事项

1. **置信度管理**：confidence < 0.5 时，参数变化幅度缩小，避免误判
2. **学习速度**：每次成功反馈 confidence += 0.05，避免过快变化
3. **健康度惩罚**：失败率高的路线会被降分，但不直接禁止
4. **隐私保护**：用户画像数据需要符合隐私政策

## 下一步

- [ ] 实现数据库持久化（当前使用内存存储）
- [ ] 添加用户画像的显式更新接口
- [ ] 实现失败模拟器（Dry-run Planner）
- [ ] 添加记忆数据的可视化分析

