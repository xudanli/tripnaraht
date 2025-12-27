# 第一性原理架构升级文档

## 概述

TripNARA 从"经验式决策"升级为"第一性原理驱动"的架构。核心思想是：**所有决策必须基于物理现实、人体能力、路线哲学这三个不可违背的原理**。

## 三个"一等公民"模型

### 1. PhysicalRealityModel（物理现实模型）

**文件：** `src/trips/decision/models/physical-reality.model.ts`

**对应第一性原理：**
- 地形（DEM、高程、坡度）
- 路网（road/ferry/rail）
- 自然障碍（河流、山脉、海岸线）
- Hazard（雪崩、泥石流、高风险区）
- 季节性 & 封路状态

**约束：** 没有 PhysicalRealityModel，就不允许生成"可执行计划"。

**接口：**
```typescript
export interface PhysicalRealityModel {
  demEvidence: DemDecisionEvidence[];     // 必须
  roadStates: RoadState[];                 // F-road 开/关、季节性
  hazardZones: HazardZoneState[];         // 雪崩带等
  ferryStates: FerryState[];
  climateSeasonality?: ClimateSeasonality; // 月份→可达性评分
  countryCode: string;
  month: number;
}
```

### 2. HumanCapabilityModel（人体能力模型）

**文件：** `src/trips/decision/models/human-capability.model.ts`

**对应第一性原理：**
- 单日可承受爬升
- 连续 3–5 天滚动爬升
- 最大可接受坡度
- 高海拔适应度
- 风险承受度
- 节奏偏好（慢游 / 刺激 / 中性）

**约束：** DecisionParams 是从这个模型投影出来的。

**接口：**
```typescript
export interface HumanCapabilityModel {
  profileId: string;
  maxDailyAscentM: number;
  rollingAscent3DaysM: number;
  maxSlopePct: number;
  preferredPace: "SLOW" | "MEDIUM" | "FAST";
  riskTolerance: "LOW" | "MEDIUM" | "HIGH";
  highAltitudeExperience: "NONE" | "BASIC" | "ADVANCED";
  // ... 更多字段
}
```

### 3. RoutePhilosophyModel（路线哲学模型）

**文件：** `src/trips/decision/models/route-philosophy.model.ts`

**对应第一性原理：**
- 不可背叛的哲学（philosophy invariants）
- 可调整的自由度

**约束：** Neptune 只在 flexibleParts 动刀，不动 coreStatement 对应的结构。

**接口：**
```typescript
export interface RoutePhilosophy {
  coreStatement: string; // "从文明进入高地，再回到人间"
  mustVisitTags?: string[]; // 必须涵盖的体验类型
  nonNegotiableRules: string[]; // Neptune 不允许打破的红线
  flexibleParts: string[];      // Neptune 可以动手脚的局部
  durationFlexibility?: {
    minDays: number;
    maxDays: number;
    preferredDays?: number;
  };
}
```

## 三段式 WorldModelContext

**文件：** `src/trips/decision/shared/world-model.types.ts`

**新结构：**
```typescript
export interface WorldModelContext {
  /** 物理现实模型（必须） */
  physical: PhysicalRealityModel;

  /** 人体能力模型（必须） */
  human: HumanCapabilityModel;

  /** 路线方向（带哲学模型，必须） */
  routeDirection: RouteDirectionWithPhilosophy;

  /** 合规证据（可选，用于 Abu 检查） */
  complianceEvidence?: ComplianceEvidence[];
}
```

**好处：**
- Abu / Dr.Dre / Neptune 永远通过这三块来决策
- 所有"经验 heuristics"都被迫用这三块的数据说话
- 后面要做「学习」只需要对这三块做参数更新

## 策略重构

### Abu：只接受"物理现实 + 合规"的输入

**第一性原理要求：**
"是否允许存在"这个问题，只能由物理现实 & 合规决定，不由"好不好玩"决定。

**实现约束：**
- 只读 `world.physical` 和 `complianceEvidence`
- 不读任何"用户想玩什么"的字段
- 日志里只写：DEM 证据、封路状态、Hazard 信息、合规/签证/季节窗口

**架构层面硬编码：**
"安全 & 可达性是第一性原理，而不是用户喜好可以 override 的东西。"

### Dr.Dre：必须完全以 HumanCapabilityModel 驱动

**第一性原理要求：**
"把人体极限当作函数，不当作感觉。"

**实现约束：**
- 输入改成明确读 `world.human`：
  ```typescript
  const pace = this.buildPaceConstraints(world.human, routeDirection);
  ```
- 所有"拆天 / 插休息日"的决策条件，统一写成对 `fatigueIndex`、`rollingAscent3DaysM` 的判断

**效果：**
Dr.Dre 从"魔法参数 if-else" → "人类能力模型驱动的控制器"

### Neptune：必须强依赖 RoutePhilosophy + PhysicalReality

**第一性原理要求：**
"绕行"不能变成"换一种旅行类型"。

**实现约束：**
- **空间约束：** 所有替代点/替代段必须：
  - 在 `routeDirection.corridorGeom` 缓冲范围内
  - 或在其 `regions` 指定的区域内
- **哲学约束：**
  - 不允许删掉 `philosophy.mustVisitTags` 对应的体验
  - 不允许跨越 `nonNegotiableRules`

**接口强制：**
```typescript
handleIssue(
  issue: SpatialIssue,
  physical: PhysicalRealityModel,
  routeDirection: RouteDirection,
  human: HumanCapabilityModel
)
```

## 结构升级 TODO 清单

### ✅ 必做（第一波就干）

- [x] 创建 PhysicalRealityModel 接口
- [x] 创建 HumanCapabilityModel 接口
- [x] 创建 RoutePhilosophyModel 接口
- [x] WorldModelContext 拆成 physical / human / routeDirection 三块
- [ ] Abu 只接受 physical/compliance，不再吃 tag/体验类字段
- [ ] Dr.Dre 的 PaceConstraints 100% 由 HumanCapabilityModel + RD softConstraints 生成
- [ ] Neptune 的替换逻辑强制带上 RoutePhilosophy（不可改部分 / 可动部分）

### 🟡 第二优先（这周或近期搞）

- [ ] 在 RouteDirection 上补 `philosophy` 字段（已完成接口定义）
- [ ] 在 Neptune 中显式地：
  - 替换前 check：不会违反 nonNegotiableRules
  - 替换后 check：核心标签/体验仍然覆盖
- [ ] 给 HumanCapabilityModel 建个简单持久化形式（TravelerProfile）：
  - 第一次靠问卷/用户输入
  - 后面每次 trip 结束更新

### 🟢 第三优先（慢慢做）

- [ ] RouteDirectionSelector 的 Seasonality/Risk 分数接入真实气候 & hazard 数据
- [ ] 决策日志结构里标记字段来源：
  - `source: "PHYSICAL" | "HUMAN" | "ROUTE_PHILOSOPHY" | "HEURISTIC"`
- [ ] 统计"我们到底多少决策是基于物理现实的"

## 示例

### 冰岛高地 F-Road 哲学

```typescript
export const ICELAND_HIGHLANDS_PHILOSOPHY: RoutePhilosophy = {
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
};
```

### 尼泊尔 EBC 哲学

```typescript
export const NEPAL_EBC_PHILOSOPHY: RoutePhilosophy = {
  coreStatement: '渐进适应 + 回撤安全线',
  mustVisitTags: ['高海拔适应', '珠峰大本营', '夏尔巴文化'],
  nonNegotiableRules: [
    '必须保证渐进适应（每天海拔上升不超过 500m）',
    '必须包含至少 2 个适应日',
    '必须保证回撤安全线（任何时候都能在 2 天内回到低海拔）',
  ],
  flexibleParts: [
    '具体适应点选择（Namche / Dingboche）',
    '侧线探索（Gokyo / Chhukung）',
    '天数（12-16 天范围内）',
  ],
};
```

## 总结

现有结构已经很接近第一性原理了，现在要做的，不是重构，而是"立宪"：

1. **明确「物理现实 / 人体能力 / 路线哲学」三权分立**
2. **让 Abu / Dr.Dre / Neptune 在代码层面只能依赖这三块**
3. **所有"体验层的花活"，都在这三块之上展开**

这样 TripNARA 就真的是：
**"按世界真实规律做决策的系统"**，
而不是**"长得很懂第一性原理，但逻辑还在堆 if-else 的系统"**。

## 对外 Narrative 推荐用法

### 标准话术

**核心定位：**
> "TripNARA 采用第一性原理架构，所有决策基于三个不可违背的原理：物理现实、人体能力、路线哲学。我们通过三个'一等公民'模型（PhysicalRealityModel、HumanCapabilityModel、RoutePhilosophyModel）驱动所有决策，确保每个决策都有明确的现实依据。"

**技术优势：**
> "与传统的经验式决策系统不同，TripNARA 不依赖启发式规则或魔法参数。每个决策都可以追溯到具体的物理现实数据、人体能力模型或路线哲学约束。"

**价值主张：**
> "TripNARA 是一个按世界真实规律思考的旅行智能，而不是一个'看上去懂旅行的 LLM Wrapper'。"

### 使用场景

1. **白皮书/技术文档**：详细阐述三个模型的设计和实现
2. **投影片/路演**：强调"第一性原理"和"三个一等公民模型"
3. **官网/产品介绍**：使用价值主张 + 技术优势（简化版）

### 示例：白皮书片段

```markdown
## TripNARA 的第一性原理架构

TripNARA 采用第一性原理架构，所有决策基于三个不可违背的原理：物理现实、人体能力、路线哲学。

### 三个"一等公民"模型

1. **PhysicalRealityModel（物理现实模型）**
   - 地形（DEM、高程、坡度）
   - 路网（road/ferry/rail）
   - 自然障碍、Hazard（雪崩、泥石流）
   - 季节性 & 封路状态

2. **HumanCapabilityModel（人体能力模型）**
   - 单日可承受爬升
   - 连续滚动爬升
   - 最大坡度、高海拔适应度
   - 风险承受度、节奏偏好

3. **RoutePhilosophyModel（路线哲学模型）**
   - 不可背叛的哲学（philosophy invariants）
   - 可调整的自由度

### 三段式 WorldModelContext

所有决策都通过这三个模型进行：
- **physical**: 地球那一坨（地形、路网、Hazard）
- **human**: 人那一坨（能力、偏好、适应度）
- **routeDirection**: 世界观那一坨（路线哲学、不可背叛的规则）

### 技术优势

与传统的经验式决策系统不同，TripNARA 不依赖启发式规则或魔法参数。每个决策都可以追溯到具体的物理现实数据、人体能力模型或路线哲学约束。

这确保了 TripNARA 是一个按世界真实规律思考的旅行智能，而不是一个"看上去懂旅行的 LLM Wrapper"。
```

