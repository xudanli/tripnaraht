# Readiness 约束集成到决策层

## 概述

本文档说明如何将 Readiness（旅行准备度检查）模块的地理数据和约束集成到决策层（Decision Layer）。

## 实现状态

### ✅ 已完成

1. **ReadinessService.getConstraints()** - 已实现
   - 位置：`src/trips/readiness/services/readiness.service.ts:341-345`
   - 功能：将 ReadinessCheckResult 转换为 ReadinessConstraint[]

2. **ReadinessToConstraintsCompiler** - 已实现
   - 位置：`src/trips/readiness/compilers/readiness-to-constraints.compiler.ts`
   - 功能：
     - `compile()` - 转换为 ReadinessConstraint[]
     - `toConstraintViolations()` - 转换为 ConstraintViolation[]（用于 DecisionLog）
     - `toCheckerViolations()` - 转换为 CheckerViolation[]（用于 ConstraintChecker）
     - `extractTasks()` - 提取任务列表

3. **TripDecisionEngineService 集成** - 已实现
   - 位置：`src/trips/decision/trip-decision-engine.service.ts:48-88`
   - 功能：
     - 在 `generatePlan()` 中调用 ReadinessService
     - 启用地理特征增强（`enhanceWithGeo: true`）
     - 将 readiness 约束信息添加到 `state.signals.alerts`
     - 存储 readiness 结果到 state 中

4. **ConstraintChecker 集成** - 已实现
   - 位置：`src/trips/decision/constraints/constraint-checker.ts:50-86`
   - 功能：
     - 在 `checkPlan()` 中添加 readiness 约束检查
     - 将 readiness violations 集成到约束检查结果中

## 工作流程

```
用户请求
  ↓
TripDecisionEngineService.generatePlan()
  ↓
ReadinessService.checkFromDestination()
  ├─→ GeoFactsService.getGeoFeaturesForPoint()  ✅ 已实现
  ├─→ 地理特征增强上下文                        ✅ 已实现
  ├─→ ReadinessChecker.checkDestination()       ✅ 已实现
  └─→ 返回 ReadinessCheckResult                ✅ 已实现
  ↓
ReadinessService.getConstraints()               ✅ 已实现
  ↓
转换为 ReadinessConstraint[]                   ✅ 已实现
  ↓
添加到 state.signals.alerts                    ✅ 已实现
  ↓
生成计划
  ↓
ConstraintChecker.checkPlan()                   ✅ 已实现
  ├─→ checkReadinessConstraints()               ✅ 已实现
  └─→ 返回包含 readiness violations 的结果    ✅ 已实现
```

## 约束类型映射

| Readiness Level | Constraint Type | Severity | 说明 |
|----------------|----------------|----------|------|
| blocker        | hard           | error    | 阻止行程的事项 |
| must           | hard           | error    | 必须完成的事项 |
| should         | soft           | warning  | 建议完成的事项 |
| optional       | soft           | info     | 可选完成的事项 |

## 地理数据使用

### 已集成的地理特征

1. **河网特征** (RiverFeatures)
   - `nearRiver` - 是否靠近河流
   - `riverCrossingCount` - 河流穿越次数
   - `riverDensityScore` - 河网密度评分

2. **山脉特征** (MountainFeatures)
   - `inMountain` - 是否在山脉中
   - `mountainElevationAvg` - 平均海拔
   - `terrainComplexity` - 地形复杂度

3. **道路特征** (RoadFeatures)
   - `nearRoad` - 是否靠近道路
   - `roadDensityScore` - 道路密度评分

4. **海岸线特征** (CoastlineFeatures)
   - `nearCoastline` - 是否靠近海岸线
   - `isCoastalArea` - 是否沿海地区

5. **POI 特征** (POIFeatures)
   - `hasFerryTerminal` - 是否有渡轮码头
   - `hasHarbour` - 是否有港口
   - `hasEVCharger` - 是否有充电桩
   - `topPickupPoints` - 主要集合点

### 在规则中使用

地理特征在 Readiness Pack 规则中通过 `geo.*` 路径访问：

```typescript
{
  id: 'rule.norway.ferry_dependent',
  when: {
    all: [
      { path: 'geo.pois.hasFerryTerminal', eq: true },
      { path: 'itinerary.activities', contains: 'self_drive' },
    ],
  },
  then: {
    level: 'must',
    message: '行程依赖渡轮。必须提前查询渡轮时刻表。',
  },
}
```

## 使用示例

### 1. 在决策层中使用

```typescript
// 在 TripDecisionEngineService 中
const readinessResult = await this.readinessService.checkFromDestination(
  destinationId,
  context,
  {
    enhanceWithGeo: true,
    geoLat: startLocation?.lat,
    geoLng: startLocation?.lng,
  }
);

// 获取约束
const constraints = await this.readinessService.getConstraints(readinessResult);

// 添加到 state.signals.alerts
state.signals.alerts.push(...constraints.map(c => ({
  code: c.id,
  severity: c.severity === 'error' ? 'critical' : 'warn',
  message: c.message,
})));
```

### 2. 在约束检查中使用

```typescript
// 在 ConstraintChecker 中
const result = this.checkPlan(state, plan);

// result.violations 包含 readiness violations
// result.isValid 会考虑 readiness blockers/must 事项
```

## 注意事项

1. **地理特征增强是可选的**
   - 需要提供坐标（`geoLat`, `geoLng`）才能启用
   - 如果没有坐标，会使用基础规则检查

2. **Blockers 不会阻止计划生成**
   - Blockers 会在约束检查中标记为错误
   - 但不会阻止计划生成流程
   - 前端应该根据 `isValid: false` 显示警告

3. **约束检查是异步的**
   - Readiness 检查是异步操作
   - 如果检查失败，不会阻断计划生成，只记录警告

## 未来改进

1. **Agent 层集成**（可选）
   - 在 Agent 的 ReAct 循环中调用 Readiness 检查
   - 将准备度信息作为上下文传递给决策层

2. **增强约束使用**
   - 在路线规划时使用地理特征（如避开高风险区域）
   - 在活动推荐时考虑地理特征（如靠近渡轮的活动）
   - 在交通规划时使用地理特征（如道路密度、港口位置）

3. **约束优先级**
   - 实现约束优先级系统
   - 允许用户选择忽略某些约束

## 相关文件

- `src/trips/readiness/services/readiness.service.ts`
- `src/trips/readiness/compilers/readiness-to-constraints.compiler.ts`
- `src/trips/decision/trip-decision-engine.service.ts`
- `src/trips/decision/constraints/constraint-checker.ts`
- `src/trips/readiness/services/geo-facts.service.ts`
