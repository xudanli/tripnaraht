# 冰岛高地 F-Road 完整 E2E 流程文档

## 概述

这是 TripNARA 的旗舰样板线，展示了从用户输入到最终计划的完整决策流程，包括：
- 路线哲学（RoutePhilosophyModel）
- 物理现实建模（PhysicalRealityModel）
- 人体能力建模（HumanCapabilityModel）
- 三人格决策链（Abu → Dr.Dre → Neptune）

## 背景 & 路线哲学

### RoutePhilosophyModel

```typescript
{
  coreStatement: "从文明进入高地，再回到人间",
  mustVisitTags: ["高地荒原", "温泉", "火山"],
  nonNegotiableRules: [
    "必须有一晚住高地 hut 或营地",
    "必须经过至少一个 F-road 路段",
    "必须从 Ring Road 进入高地，再回到 Ring Road",
  ],
  flexibleParts: [
    "具体 F-road 选择（F26 / F35 / F208）",
    "中间停留点（POI 可替换）",
    "天数（7-10 天范围内）",
  ],
}
```

**核心价值**：体验从文明世界进入高地荒原，再回到人间，而不是在一号公路上兜圈子。

## 使用的数据

### DEM 数据
- 高程剖面：500m - 1200m
- 坡度分析：识别过陡路段（>25%）
- 连续爬升检测：3 天滚动窗口

### F-road 数据
- F26、F35、F208 状态（开放/关闭/季节性）
- 4x4 要求
- 季节性开放时间（通常 6-9 月）

### 河网数据
- 河流交叉点
- 水位季节性变化

### Hazard 数据
- 雪崩风险区域
- 泥石流风险区域
- 季节性高风险月份

## WorldModelContext 示例

### PhysicalRealityModel

```typescript
{
  demEvidence: [
    {
      segmentId: "DAY1_SEG1",
      elevationProfile: [500, 650, 700],
      cumulativeAscent: 350,
      maxSlopePct: 18,
      rollingAscent3Days: 350,
      fatigueIndex: 0.8,
      violation: "NONE",
      explanation: "第一天爬升正常",
    },
    {
      segmentId: "DAY2_SEG1",
      elevationProfile: [700, 900, 950],
      cumulativeAscent: 400,
      maxSlopePct: 22,
      rollingAscent3Days: 750,
      fatigueIndex: 1.0,
      violation: "NONE",
      explanation: "第二天爬升正常",
    },
  ],
  roadStates: [
    {
      roadId: "F26",
      status: "OPEN",
      requires4x4: true,
      seasonOpenFrom: 6,
      seasonOpenTo: 9,
    },
  ],
  hazardZones: [
    {
      zoneId: "hazard_1",
      type: "AVALANCHE",
      level: "LOW",
      seasonality: {
        highRiskMonths: [11, 12, 1, 2, 3],
        lowRiskMonths: [6, 7, 8, 9],
      },
    },
  ],
  ferryStates: [],
  climateSeasonality: {
    countryCode: "IS",
    month: 8,
    accessibilityScore: 0.9,
    typicalWeather: {
      windSpeedMps: 8,
      precipitationMmPerHour: 2,
      visibilityMeters: 5000,
      temperatureCelsius: 12,
    },
  },
  countryCode: "IS",
  month: 8,
}
```

### HumanCapabilityModel

```typescript
{
  profileId: "user_123",
  maxDailyAscentM: 900,
  rollingAscent3DaysM: 2400,
  maxSlopePct: 25,
  preferredPace: "MEDIUM",
  riskTolerance: "MEDIUM",
  highAltitudeExperience: "BASIC",
  maxElevationM: 4500,
  requiresGradualAscent: true,
  bufferDayBias: "MEDIUM",
  weatherRiskWeight: 0.5,
}
```

### RouteDirection

```typescript
{
  countryCode: "IS",
  name: "ICELAND_HIGHLANDS_F_ROAD_EXPEDITION",
  nameCN: "冰岛高地 F 路穿越",
  tags: ["越野", "高地", "徒步", "自然"],
  bestMonths: [7, 8],
  regions: ["Highlands"],
  constraints: {
    hard: {
      maxDailyRapidAscentM: 900,
      rapidAscentForbidden: false,
      requires4x4: true,
    },
    soft: {
      maxElevationM: 1200,
      maxDailyAscentM: 900,
      bufferTimeMin: 90,
    },
  },
  philosophy: {
    coreStatement: "从文明进入高地，再回到人间",
    mustVisitTags: ["高地荒原", "温泉", "火山"],
    nonNegotiableRules: [
      "必须有一晚住高地 hut 或营地",
      "必须经过至少一个 F-road 路段",
    ],
    flexibleParts: [
      "具体 F-road 选择（F26 / F35 / F208）",
      "中间停留点（POI 可替换）",
    ],
  },
}
```

## 引擎调用顺序

### 1. RouteDirection Selector

```typescript
const routeDirections = await routeDirectionSelector.pickRouteDirections(
  {
    preferences: ["摄影", "自然", "冒险"],
    riskTolerance: "MEDIUM",
    travelStyle: "ADVENTURE",
  },
  "IS",
  8 // August
);
```

**输出**：选择 `ICELAND_HIGHLANDS_F_ROAD_EXPEDITION`

### 2. POI Generator

```typescript
const pois = await poiGenerator.generatePoisForRouteDirection(
  selectedRouteDirection,
  {
    preferViewpoints: 0.4,
    preferPhotography: 0.3,
    preferHotSpring: 0.3,
  }
);
```

**输出**：候选 POI 列表（Landmannalaugar、Askja、Sprengisandur 等）

### 3. WorldModel 构建

```typescript
const world: WorldModelContext = {
  physical: await buildPhysicalRealityModel(countryCode, month, segments),
  human: await buildHumanCapabilityModel(userProfile),
  routeDirection: selectedRouteDirection,
  complianceEvidence: await checkCompliance(selectedRouteDirection),
};
```

### 4. Abu Strategy（安全否决者）

```typescript
const abuResult = await abuStrategy.evaluate(world, plan);
```

**检查项**：
- DEM 硬违规（HARD violation）
- 道路状态（F-road 是否开放）
- 危险区域（雪崩风险）
- 合规（4x4 要求、许可）

**DecisionLog 示例（PHYSICAL）**：
```json
{
  "persona": "ABU",
  "action": "ALLOW",
  "explanation": "未发现硬性风险问题（DEM、道路、危险区域、合规均通过），允许继续",
  "reasonCodes": [],
  "decisionSource": "PHYSICAL",
  "timestamp": "2024-08-15T10:00:00Z"
}
```

### 5. Dr.Dre Strategy（节奏修复者）

```typescript
const dreResult = await drDreStrategy.evaluate(world, plan);
```

**检查项**：
- 单日疲劳指数（fatigueIndex > 1.1）
- 连续 3 天滚动爬升（rollingAscent3DaysM > 2400）
- 节奏偏好（preferredPace）

**DecisionLog 示例（HUMAN）**：
```json
{
  "persona": "DR_DRE",
  "action": "ADJUST",
  "explanation": "将第 4 天拆分为两天，并在第 5 天前插入缓冲日以恢复体力",
  "reasonCodes": ["SPLIT_DAY", "INSERT_BUFFER_DAY"],
  "decisionSource": "HUMAN",
  "timestamp": "2024-08-15T10:01:00Z"
}
```

### 6. Neptune Strategy（空间修复者）

```typescript
const neptuneResult = await neptuneStrategy.evaluate(world, plan);
```

**检查项**：
- 空间问题（POI 不可用、路段封闭）
- 路线哲学验证（替换是否违反 mustVisitTags）
- 核心体验覆盖（替换后是否仍覆盖核心体验）

**DecisionLog 示例（PHILOSOPHY）**：
```json
{
  "persona": "NEPTUNE",
  "action": "ALLOW",
  "explanation": "替换操作违反路线哲学（不允许删除必须体验类型: 高地荒原），拒绝替换",
  "reasonCodes": ["PHILOSOPHY_VIOLATION"],
  "decisionSource": "PHILOSOPHY",
  "timestamp": "2024-08-15T10:02:00Z"
}
```

**DecisionLog 示例（PHYSICAL）**：
```json
{
  "persona": "NEPTUNE",
  "action": "REPLACE",
  "explanation": "F26 路段因暴雨封闭，已替换为绕行路径（2 段新路段）",
  "reasonCodes": ["SEGMENT_BLOCKED", "SPATIAL_REPLACEMENT"],
  "decisionSource": "PHYSICAL",
  "timestamp": "2024-08-15T10:03:00Z"
}
```

## 输出

### 最终计划

```typescript
{
  tripId: "trip_123",
  routeDirectionId: "iceland_highlands_froad",
  segments: [
    {
      segmentId: "DAY1_SEG1",
      dayIndex: 1,
      distanceKm: 16,
      ascentM: 350,
      slopePct: 18,
      metadata: {
        fromPoiId: "landmannalaugar",
        toPoiId: "camp_site_A",
        mode: "HIKING",
      },
    },
    // ... 更多路段
  ],
}
```

### DecisionLog 汇总

```typescript
{
  logs: [
    {
      persona: "ABU",
      action: "ALLOW",
      decisionSource: "PHYSICAL",
      // ...
    },
    {
      persona: "DR_DRE",
      action: "ADJUST",
      decisionSource: "HUMAN",
      // ...
    },
    {
      persona: "NEPTUNE",
      action: "REPLACE",
      decisionSource: "PHYSICAL",
      // ...
    },
  ],
  stats: {
    totalDecisions: 3,
    bySource: {
      PHYSICAL: 2,
      HUMAN: 1,
      PHILOSOPHY: 0,
      HEURISTIC: 0,
    },
    realityDrivenRatio: 1.0, // 100% 硬现实驱动
  },
}
```

## 关键指标

### 决策来源分布

- **PHYSICAL**: 66.7%（2/3）
- **HUMAN**: 33.3%（1/3）
- **PHILOSOPHY**: 0%（本次未触发）
- **HEURISTIC**: 0%（本次未触发）

**硬现实驱动比例**: 100%（PHYSICAL + HUMAN）

### Persona 触发频次

- **Abu**: 1 次（ALLOW）
- **Dr.Dre**: 1 次（ADJUST）
- **Neptune**: 1 次（REPLACE）

## 使用场景

### 1. 新同事 Onboarding

阅读本文档，了解：
- TripNARA 的决策流程
- 三个模型的角色
- 三人格的职责

### 2. 对外 Demo

展示：
- 完整的决策链路
- 决策来源追踪
- 硬现实驱动比例

### 3. 工程验证

验证：
- 模型完整性
- 决策链正确性
- 日志可追溯性

## 扩展阅读

- [第一性原理架构](./FIRST_PRINCIPLES_ARCHITECTURE.md)
- [决策来源追踪](./DECISION_SOURCE_TRACKING.md)
- [冰岛高地 E2E 测试](../src/trips/e2e/iceland-highlands.e2e.spec.ts)

