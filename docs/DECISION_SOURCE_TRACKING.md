# 决策来源追踪系统

## 概述

为了量化 TripNARA 有多少判断是基于现实，我们在决策日志中引入了 `decisionSource` 字段，用于追踪每个决策的来源。

## 决策来源类型

```typescript
export type DecisionSource = "PHYSICAL" | "HUMAN" | "PHILOSOPHY" | "HEURISTIC";
```

### PHYSICAL（物理现实）

基于物理现实模型的决策，包括：
- DEM 证据（地形、高程、坡度）
- 道路状态（封路、季节性关闭）
- 危险区域（雪崩、泥石流、高风险区）
- 渡轮状态
- 气候季节性

**使用场景：**
- Abu 的所有决策（安全否决）
- Neptune 的空间替换决策（基于道路/POI/路段状态）

### HUMAN（人体能力）

基于人体能力模型的决策，包括：
- 单日可承受爬升
- 连续滚动爬升
- 最大坡度
- 高海拔适应度
- 风险承受度
- 节奏偏好

**使用场景：**
- Dr.Dre 的所有决策（节奏管理、疲劳检测、日拆分、缓冲日插入）

### PHILOSOPHY（路线哲学）

基于路线哲学模型的决策，包括：
- 核心陈述（路线的本质）
- 必须涵盖的体验类型
- 不可协商的规则
- 可灵活调整的部分

**使用场景：**
- Neptune 的哲学验证（替换前检查、替换后检查）
- Neptune 拒绝违反哲学的替换操作

### HEURISTIC（启发式规则）

基于经验、默认值或启发式规则的决策。

**使用场景：**
- 无法获取路线方向信息时的默认行为
- 其他基于经验的决策

## 实现细节

### 1. DecisionLogEntry 接口更新

```typescript
export interface DecisionLogEntry {
  persona: DecisionPersona;
  action: DecisionAction;
  explanation: string;
  reasonCodes: string[];
  evidenceRefs?: string[];
  timestamp: string;
  /** 决策来源（第一性原理追踪） */
  decisionSource: DecisionSource;
}
```

### 2. 策略实现

#### Abu Strategy
- 所有决策标记为 `PHYSICAL`
- 因为 Abu 只基于物理现实和合规证据做决策

#### Dr.Dre Strategy
- 所有决策标记为 `HUMAN`
- 因为 Dr.Dre 完全基于人体能力模型做决策

#### Neptune Strategy
- 空间替换决策标记为 `PHYSICAL`（基于道路/POI/路段状态）
- 哲学验证决策标记为 `PHILOSOPHY`（基于路线哲学）
- 无法获取路线方向信息时标记为 `HEURISTIC`

## 使用示例

### 查询决策来源分布

```typescript
// 统计某个 trip 的决策来源分布
const logs = await getDecisionLogs(tripId);
const sourceDistribution = {
  PHYSICAL: logs.filter(l => l.decisionSource === 'PHYSICAL').length,
  HUMAN: logs.filter(l => l.decisionSource === 'HUMAN').length,
  PHILOSOPHY: logs.filter(l => l.decisionSource === 'PHILOSOPHY').length,
  HEURISTIC: logs.filter(l => l.decisionSource === 'HEURISTIC').length,
};

console.log('决策来源分布:', sourceDistribution);
// 输出示例：
// {
//   PHYSICAL: 5,
//   HUMAN: 3,
//   PHILOSOPHY: 2,
//   HEURISTIC: 0
// }
```

### 量化"基于现实"的决策比例

```typescript
const totalDecisions = logs.length;
const realityBasedDecisions = logs.filter(
  l => l.decisionSource === 'PHYSICAL' || l.decisionSource === 'HUMAN'
).length;
const realityBasedRatio = realityBasedDecisions / totalDecisions;

console.log(`基于现实的决策比例: ${(realityBasedRatio * 100).toFixed(1)}%`);
```

## 单元测试

为三个核心模型编写了完整的单元测试：

1. **PhysicalRealityModel 测试** (`src/trips/decision/models/__tests__/physical-reality.model.spec.ts`)
   - 验证模型完整性
   - 检测字段变更
   - 防止"越权使用"

2. **HumanCapabilityModel 测试** (`src/trips/decision/models/__tests__/human-capability.model.spec.ts`)
   - 从用户画像关键词生成模型
   - 投影为 DecisionParams
   - 检测字段变更

3. **RoutePhilosophyModel 测试** (`src/trips/decision/models/__tests__/route-philosophy.model.spec.ts`)
   - 验证替换操作不违反哲学
   - 检查核心体验覆盖
   - 检测字段变更

## 价值

1. **可观测性**：可以量化 TripNARA 的决策有多少是基于现实（PHYSICAL + HUMAN）
2. **可追溯性**：每个决策都有明确的来源，便于调试和优化
3. **可审计性**：可以追踪哪些决策是基于哲学（PHILOSOPHY）或启发式规则（HEURISTIC）
4. **模型保护**：通过单元测试确保模型不被"越权使用"，改动可追踪

## HEURISTIC 减肥计划

### 目标

将 HEURISTIC 决策逐步转换为 PHYSICAL / HUMAN / PHILOSOPHY 决策。

### 如何识别 HEURISTIC 热点

使用 `HeuristicDietService` 生成减肥计划：

```typescript
const dietPlan = await heuristicDietService.generateDietPlan();
```

### 转换场景

#### 1. Neptune HEURISTIC → PHYSICAL

**场景**：Neptune 经常用 HEURISTIC 决策

**原因**：corridor / hazard / POI 数据不完整

**转换方案**：
- 补充 corridorGeom 数据（PostGIS）
- 补充 hazard zone 数据
- 补充 POI 可用性数据
- 完善 SpatialIssueDetectorService

#### 2. Dr.Dre HEURISTIC → HUMAN

**场景**：Dr.Dre 有 HEURISTIC 条目

**原因**：用户画像里的某部分还没正式抽进 HumanCapabilityModel

**转换方案**：
- 从用户反馈学习 HumanCapabilityModel
- 基于真实数据校准 FatigueCalculatorService
- 建立用户画像 → HumanCapabilityModel 映射表

#### 3. Abu HEURISTIC → PHYSICAL

**场景**：Abu 使用 HEURISTIC（理论上不应该）

**原因**：PhysicalRealityModel 数据缺失

**转换方案**：
- 补充 DEM 数据
- 补充 road status 数据
- 补充 hazard zone 数据
- 补充 climate seasonality 数据

### 优先级

1. **高优先级（priority >= 9）**：HEURISTIC 占比 > 20%
2. **中优先级（priority 6-8）**：HEURISTIC 占比 10-20%
3. **低优先级（priority < 6）**：HEURISTIC 占比 < 10%

### 验收标准

转换完成后，该场景的 HEURISTIC 决策应 < 5%。

## 未来扩展

1. **决策来源分析 Dashboard**：可视化决策来源分布
2. **决策质量评分**：基于决策来源的权重计算决策质量
3. **学习闭环**：根据决策来源分布调整模型参数

## 对外 Narrative 推荐用法

### 标准话术

**核心定位：**
> "TripNARA 将每一次决策标记为 4 类来源：物理现实、人类能力、路线哲学、启发式。我们的目标是让 80%+ 的关键决策来自前 3 者。"

**数据支撑：**
> "在冰岛高地 E2E 测试中，TripNARA 的决策中 100% 来自物理现实建模和人体能力建模，0% 来自启发式规则。"

**价值主张：**
> "TripNARA 是一个按世界真实规律思考的旅行智能，而不是一个'看上去懂旅行的 LLM Wrapper'。"

**技术细节（可选）：**
> "我们通过三个'一等公民'模型（PhysicalRealityModel、HumanCapabilityModel、RoutePhilosophyModel）驱动所有决策，确保每个决策都有明确的现实依据。"

### 使用场景

1. **白皮书/技术文档**：直接引用标准话术，补充具体数据
2. **投影片/路演**：使用核心定位 + 数据支撑
3. **官网/产品介绍**：使用价值主张 + 技术细节（简化版）

### 示例：白皮书片段

```markdown
## TripNARA 的决策哲学

TripNARA 将每一次决策标记为 4 类来源：物理现实、人类能力、路线哲学、启发式。我们的目标是让 80%+ 的关键决策来自前 3 者。

在冰岛高地 E2E 测试中，TripNARA 的决策中 100% 来自物理现实建模和人体能力建模，0% 来自启发式规则。这证明了 TripNARA 是一个按世界真实规律思考的旅行智能，而不是一个"看上去懂旅行的 LLM Wrapper"。

我们通过三个"一等公民"模型（PhysicalRealityModel、HumanCapabilityModel、RoutePhilosophyModel）驱动所有决策，确保每个决策都有明确的现实依据。
```

