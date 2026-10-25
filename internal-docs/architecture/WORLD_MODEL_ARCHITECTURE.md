# 世界模型（World Model）架构说明

## 概述

世界模型是 TripNARA 决策系统的"眼睛"，它让系统能够"看见真实世界"。核心思想是将旅行规划抽象成：

**State（世界状态）+ Constraints（约束）+ Objective（目标函数）+ Actions（动作）**

---

## 架构设计：三段式结构（第一性原理）

世界模型采用**三段式结构**，基于第一性原理：

```typescript
interface WorldModelContext {
  /** 物理现实模型（必须） */
  physical: PhysicalRealityModel;      // 地球那一坨
  
  /** 人体能力模型（必须） */
  human: HumanCapabilityModel;         // 人那一坨
  
  /** 路线方向（带哲学模型，必须） */
  routeDirection: RouteDirectionWithPhilosophy;  // 世界观那一坨
}
```

### 1. PhysicalRealityModel（物理现实模型）

**文件**: `src/trips/decision/models/physical-reality.model.ts`

**核心思想**: 地球那一坨——地形、路网、自然障碍、Hazard、季节性

**数据结构**:
```typescript
interface PhysicalRealityModel {
  /** DEM 决策证据（必须） */
  demEvidence: DemDecisionEvidence[];  // 高程、坡度、爬升
  
  /** 道路状态（F-road 开/关、季节性） */
  roadStates: RoadState[];             // 道路开放状态
  
  /** 危险区域状态（雪崩带等） */
  hazardZones: HazardZoneState[];      // 危险区域
  
  /** 渡轮状态 */
  ferryStates: FerryState[];           // 渡轮运行状态
  
  /** 气候季节性（月份→可达性评分） */
  climateSeasonality?: ClimateSeasonality;  // 季节性模式
  
  /** 国家代码 */
  countryCode: string;
  
  /** 月份 */
  month: number;
}
```

**关键字段说明**:
- `demEvidence`: DEM（数字高程模型）证据，包含：
  - `elevationProfile`: 高程剖面
  - `cumulativeAscent`: 累计爬升
  - `maxSlopePct`: 最大坡度百分比
  - `rollingAscent3Days`: 连续3天滚动爬升
  - `fatigueIndex`: 疲劳指数
  - `violation`: 违规级别（HARD/SOFT/NONE）

- `roadStates`: 道路状态，包含：
  - `status`: OPEN/CLOSED/SEASONAL/RESTRICTED
  - `seasonOpenFrom/To`: 季节性开放月份
  - `requires4x4`: 是否需要四驱车
  - `requiresPermit`: 是否需要许可证

- `hazardZones`: 危险区域，包含：
  - `type`: AVALANCHE/MUDSLIDE/FLOOD/ICE/VOLCANIC
  - `level`: NONE/LOW/MEDIUM/HIGH
  - `seasonality`: 高风险/低风险月份

- `ferryStates`: 渡轮状态，包含：
  - `status`: RUNNING/CANCELLED/SEASONAL
  - `seasonOpenFrom/To`: 季节性运行月份

- `climateSeasonality`: 气候季节性，包含：
  - `accessibilityScore`: 可达性评分（0-1）
  - `typicalWeather`: 典型天气（风速、降水、能见度、温度）
  - `riskFactors`: 风险因子列表

**约束**: 没有 PhysicalRealityModel，就不允许生成"可执行计划"

---

### 2. HumanCapabilityModel（人体能力模型）

**文件**: `src/trips/decision/models/human-capability.model.ts`

**核心思想**: 人那一坨——能力、偏好、适应度

**数据结构**:
```typescript
interface HumanCapabilityModel {
  /** 用户画像 ID */
  profileId: string;
  
  /** 单日最大爬升（米） */
  maxDailyAscentM: number;
  
  /** 连续 3 天滚动爬升阈值（米） */
  rollingAscent3DaysM: number;
  
  /** 最大可接受坡度（百分比） */
  maxSlopePct: number;
  
  /** 节奏偏好 */
  preferredPace: 'SLOW' | 'MEDIUM' | 'FAST';
  
  /** 风险承受度 */
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 高海拔经验 */
  highAltitudeExperience: 'NONE' | 'BASIC' | 'ADVANCED';
  
  /** 最大海拔（米，基于高海拔经验） */
  maxElevationM?: number;
  
  /** 是否需要渐进适应（高海拔） */
  requiresGradualAscent?: boolean;
  
  /** 缓冲日偏好 */
  bufferDayBias?: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 天气风险权重（0-1，越高越敏感） */
  weatherRiskWeight?: number;
}
```

**关键字段说明**:
- `maxDailyAscentM`: 单日可承受的最大爬升（米）
  - 低体能: 400m
  - 中等体能: 800m（默认）
  - 高体能: 1200m

- `rollingAscent3DaysM`: 连续3天滚动爬升阈值
  - 低体能: 1000m
  - 中等体能: 2000m（默认）
  - 高体能: 3000m

- `maxSlopePct`: 最大可接受坡度百分比
  - 低体能: 15%
  - 中等体能: 25%（默认）
  - 高体能: 30%

- `preferredPace`: 节奏偏好
  - SLOW: 慢游、放松
  - MEDIUM: 中等节奏（默认）
  - FAST: 快节奏、刺激

- `riskTolerance`: 风险承受度
  - LOW: 保守、安全第一
  - MEDIUM: 中等（默认）
  - HIGH: 冒险、愿意承担风险

- `highAltitudeExperience`: 高海拔经验
  - NONE: 无经验，最大海拔3000m，需要渐进适应
  - BASIC: 基础经验，最大海拔4500m，需要渐进适应
  - ADVANCED: 高级经验，最大海拔6000m，不需要渐进适应

**从用户画像生成**:
```typescript
createHumanCapabilityModelFromProfile(profileId, {
  pace: 'relaxed' | 'normal' | 'fast' | 'intense',
  fitness: 'low' | 'medium' | 'high' | 'extreme',
  riskTolerance: 'low' | 'medium' | 'high',
  highAltitudeExperience: 'none' | 'basic' | 'advanced'
})
```

---

### 3. RouteDirectionWithPhilosophy（路线方向 + 哲学模型）

**文件**: `src/trips/decision/models/route-philosophy.model.ts`

**核心思想**: 世界观那一坨——路线哲学、不可背叛的规则

**数据结构**:
```typescript
interface RoutePhilosophy {
  /** 核心陈述（一句话描述路线的本质） */
  coreStatement: string;
  
  /** 必须涵盖的体验类型（Neptune 不允许删除） */
  mustVisitTags?: string[];
  
  /** 不可协商的规则（Neptune 不允许打破的红线） */
  nonNegotiableRules: string[];
  
  /** 可灵活调整的部分（Neptune 可以动手脚的局部） */
  flexibleParts: string[];
  
  /** 天数弹性区间 */
  durationFlexibility?: {
    minDays: number;
    maxDays: number;
    preferredDays?: number;
  };
}
```

**示例：冰岛高地 F-Road 哲学**:
```typescript
{
  coreStatement: '从文明进入高地，再回到人间',
  mustVisitTags: ['高地荒原', '温泉', '火山'],
  nonNegotiableRules: [
    '必须有一晚住高地 hut 或营地',
    '必须经过至少一个 F-road 路段',
    '必须从 Ring Road 进入高地，再回到 Ring Road',
  ],
  flexibleParts: [
    '具体 F-road 选择（F26 / F35 / F208）',
    '中间停留点（POI 可替换）',
    '天数（7-10 天范围内）',
  ],
  durationFlexibility: {
    minDays: 7,
    maxDays: 10,
    preferredDays: 8,
  },
}
```

**约束 Neptune**: 只在 `flexibleParts` 动刀，不动 `coreStatement` 对应的结构

---

## 旧版世界模型（向后兼容）

**文件**: `src/trips/decision/world-model.ts`

**数据结构**:
```typescript
interface TripWorldState {
  /** 行程上下文 */
  context: TripContextState;           // 目的地、天数、偏好、预算
  
  /** 候选活动池（按日期分组） */
  candidatesByDate: Record<ISODate, ActivityCandidate[]>;
  
  /** 交通时间矩阵（缓存） */
  travelMatrix?: Record<string, number>;  // key: `${fromId}->${toId}` minutes
  
  /** 外部信号（天气、警报等） */
  signals: ExternalSignalsState;
  
  /** 策略配置 */
  policies?: {
    dayStart?: ISOTime;
    dayEnd?: ISOTime;
    bufferMinBetweenActivities?: number;
    maxBudgetOverrunRatio?: number;
  };
}
```

**关键类型**:
- `ActivityCandidate`: 活动候选（POI/活动）
  - 位置、时长、开放时间、成本、风险、替代组
- `TravelLeg`: 交通段（出行方式、时间、距离、可靠性）
- `UserPreferenceProfile`: 用户偏好（意图权重、节奏、风险偏好）
- `TripContextState`: 行程上下文（目的地、日期、预算、偏好）

---

## 世界模型构建

**文件**: `src/skills/world/world-build-context.skill.ts`

**用途**: 一次性拉齐 WorldModelContext 所需的一切

**输入**:
```typescript
{
  tripId?: string;              // 行程 ID（如果有）
  countryCode?: string;          // 或原始参数
  season?: number;              // 季节（月份 1-12）
  duration?: number;            // 行程天数
  partyProfile?: {              // 团队画像
    mobilityProfile?: string;
    riskTolerance?: 'low' | 'medium' | 'high';
    fitness?: 'low' | 'medium' | 'high';
    pace?: 'relaxed' | 'moderate' | 'intense';
  };
  routeDirectionId?: string;    // 路线方向 ID（可选）
}
```

**输出**:
```typescript
{
  world: WorldModelContext;      // 完整的世界模型上下文
  missingPieces: {               // 缺失的数据片段
    demGaps?: string[];
    humanProfileIncomplete?: boolean;
    routeDirectionMissing?: boolean;
    physicalRealityIncomplete?: boolean;
  };
}
```

**构建流程**:
1. 获取基础数据（从 tripId 或原始参数）
2. 构建 HumanCapabilityModel（从用户画像）
3. 获取 RouteDirection（从 routeDirectionId 或国家代码）
4. 构建 PhysicalRealityModel（DEM、道路、危险区域、渡轮、气候）
5. 组装 WorldModelContext

---

## 世界模型在决策系统中的应用

### 1. 三个决策策略（Three Guardians）

#### Abu（保谁）- Risk-based Prioritization
- **输入**: `WorldModelContext` + 候选活动
- **用途**: 当时间/体力/预算不够时，保核心体验，砍边角
- **依赖**: `physical.demEvidence`, `human.maxDailyAscentM`, `routeDirection.philosophy.mustVisitTags`

#### Dr.Dre（先做哪个）- Constrained Scheduling
- **输入**: `WorldModelContext` + 候选活动
- **用途**: 把一天的候选活动变成可执行时间轴
- **依赖**: `physical.roadStates`, `physical.climateSeasonality`, `human.preferredPace`

#### Neptune（世界变了怎么办）- Plan Repair
- **输入**: `WorldModelContext` + 现有计划 + 违规检测
- **用途**: 最小改动修复计划
- **依赖**: `routeDirection.philosophy.flexibleParts`, `physical.hazardZones`, `physical.ferryStates`

### 2. Domain Agents（世界模型层）

**文件**: `src/agent/services/domain-agents/`

**四个 Domain Agents**:
- **GeoAgent**: 地理分析（地形、路线可行性、附近 POI）
- **WeatherAgent**: 天气预报（预报、道路封闭风险）
- **CostAgent**: 成本估算（价格曲线、季节溢价）
- **ExperienceAgent**: 体验分析（体验密度、疲劳预测）

**数据流**:
```
Domain Agents → World Model Data → WorldModelContext
     ↓
替代方案 + 本地洞察 + ASSUMPTION 标注
```

---

## 世界模型数据来源

### 1. PhysicalRealityModel 数据来源

- **DEM 数据**: 从 RouteDirection 的 segments 计算
- **道路状态**: 从 `data/physical-reality/road-status/` JSON 文件
- **危险区域**: 从 `data/physical-reality/` 或数据库
- **渡轮状态**: 从 `data/physical-reality/ferry-schedules/` JSON 文件
- **气候季节性**: 从 `data/physical-reality/weather-windows/` JSON 文件

### 2. HumanCapabilityModel 数据来源

- **用户画像**: 从 Trip 的 `pacingConfig` 或用户偏好
- **默认值**: 如果用户未指定，使用中等体能默认值

### 3. RouteDirection 数据来源

- **路线方向**: 从 `RouteDirection` 表查询
- **路线哲学**: 从 `RoutePhilosophy` 或 RouteDirection 的 metadata

---

## 验证和完整性检查

### PhysicalRealityModel 验证

**函数**: `validatePhysicalRealityModel()`

**检查项**:
- ✅ `demEvidence` 不能为空
- ✅ `roadStates` 必须存在
- ✅ `hazardZones` 必须存在
- ✅ `ferryStates` 必须存在
- ✅ `countryCode` 必须存在
- ✅ `month` 必须在 1-12 范围内

### RoutePhilosophy 验证

**函数**: `validateReplacementAgainstPhilosophy()`

**检查项**:
- ✅ 不允许删除 `mustVisitTags`
- ✅ 不允许违反 `nonNegotiableRules`
- ✅ 替换操作必须在 `flexibleParts` 范围内

---

## 使用示例

### 示例 1: 构建世界模型上下文

```typescript
import { WorldBuildContextSkill } from './skills/world/world-build-context.skill';

const skill = new WorldBuildContextSkill(...);

const result = await skill.execute({
  tripId: 'trip-123',
  // 或
  countryCode: 'IS',
  season: 7,  // 7月
  duration: 8,
  partyProfile: {
    fitness: 'medium',
    pace: 'moderate',
    riskTolerance: 'medium',
  },
});

const { world, missingPieces } = result;

// world.physical.demEvidence - DEM 证据
// world.human.maxDailyAscentM - 人体能力
// world.routeDirection.philosophy - 路线哲学
```

### 示例 2: 在决策引擎中使用

```typescript
import { TripDecisionEngineService } from './decision/trip-decision-engine.service';
import { WorldModelContext } from './decision/shared/world-model.types';

// 1. 构建世界模型
const world: WorldModelContext = await buildWorldModelContext(tripId);

// 2. 使用 Abu 策略（保谁）
const abuResult = await abuStrategy.evaluate(world, planDraft);

// 3. 使用 Dr.Dre 策略（先做哪个）
const drDreResult = await drDreStrategy.adjustPace(world, planDraft);

// 4. 使用 Neptune 策略（修复）
const neptuneResult = await neptuneStrategy.repair(world, brokenPlan, issue);
```

---

## 相关文件

### 核心文件
- `src/trips/decision/world-model.ts` - 旧版世界模型（向后兼容）
- `src/trips/decision/shared/world-model.types.ts` - 世界模型类型定义
- `src/trips/decision/models/physical-reality.model.ts` - 物理现实模型
- `src/trips/decision/models/human-capability.model.ts` - 人体能力模型
- `src/trips/decision/models/route-philosophy.model.ts` - 路线哲学模型

### 构建和集成
- `src/skills/world/world-build-context.skill.ts` - 世界模型构建 Skill
- `src/trips/decision/trip-decision-engine.service.ts` - 决策引擎（使用世界模型）
- `src/agent/services/domain-agents/` - Domain Agents（提供世界模型数据）

### 文档
- `src/trips/decision/README.md` - 决策层文档
- `prompts/agents/LocalInsight.md` - LocalInsight Agent（世界模型层）

---

## 总结

世界模型是 TripNARA 决策系统的核心，它：

1. **三段式结构**：Physical（地球）+ Human（人）+ RouteDirection（世界观）
2. **第一性原理**：基于真实世界的物理约束和人体能力
3. **不可背叛的规则**：路线哲学定义了什么是"必须的"，什么是"可调整的"
4. **完整性验证**：确保所有必需数据都存在，才能生成可执行计划
5. **动态更新**：支持世界状态变化时的计划修复（Neptune）

**核心理念**: 系统必须"看见真实"，才能做出可靠的决策。
