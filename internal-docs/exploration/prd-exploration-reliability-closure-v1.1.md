# TripNARA 探索规划与可靠性决策闭环 PRD

**文档版本：** V1.1  
**文档状态：** 内部评审稿（已合并专家评审修订）  
**产品阶段：** Product Discovery / MVP  
**目标场景：** 冰岛复杂自驾首轮研究验证  
**产品定位：** 通用探索规划流程，以冰岛作为首个可配置研究实例  
**核心原则：** 产品流程通用化、目的地能力插件化、研究实验配置化、决策执行权威化  

**V1.1 修订要点：**

- 明确 `ExplorationScenario` 与 `Canonical Trip` 的生命周期与物化契约  
- C 端 `TravelPrinciple` 降级为 Consumer Principle Card，SSOT 为 `TravelDecisionContract`  
- Consumer BFF 唯一读源：`Gateway Assessment` → `FeasibilityProjectionService` → `Unified Decision ReadModel`  
- 单 Scenario 单 Trip、多 Route Variant 候选模型  
- Sprint 0.5 作为可靠性开发 hard gate  

**相关文档：**

- [TripNARA AI Native 产品定位](../product/TRIPNARA_AI_NATIVE_POSITIONING.md)
- [Travel Decision Contract 前端 API](../../src/trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)  
- [约束语义收口](../../src/decision-runtime/CONSTRAINT_SEMANTIC_CONSOLIDATION.md)  
- [Decision Runtime 成熟度](../../src/decision-runtime/DECISION_RUNTIME_MATURITY.md)  
- [Agent 统一接口范围](../../src/agent/delivery/AGENT_UNIFIED_INTERFACE_SCOPE.md)  

---

# 一、项目背景

TripNARA 当前已经具备较完整的旅行决策底层能力，包括：

* 目的地规则识别；
* 约束评估；
* 可执行性检查；
* BLOCK / CONFLICT / VERIFY 等问题生成；
* DecisionProblem；
* 多个修复方案；
* 方案提交与应用；
* 行程重新验证；
* Plan Studio、Readiness、Feasibility Report、Decision Center 等专业产品模块。

目前的主要问题不是「系统无法发现和解决旅行问题」，而是：

> 已有能力分散在多个专业模块中，尚未形成一个普通 C 端用户可以快速理解和完成的探索规划闭环。

用户需要面对的不是 Constraint Gateway、目的地规则包、可执行性证明、多目标优化矩阵、决策运行时，而是一个更简单的产品过程：

```text
我想进行一趟怎样的旅行
→ 有哪些不同的旅行方式
→ 每种方式能获得什么、牺牲什么
→ 哪一种更适合我
→ 当前方案有没有我不知道的问题
→ 如果有问题，我可以怎么修改
```

同时，TripNARA 需要避免为了完成冰岛用户研究，直接在业务代码中写死冰岛 9 天、三条固定路线、F208、2WD、两个修复方案、固定页面文案。

因此，本项目需要建立的是：

> 一套通用的「探索—比较—验证—决策—重新验证」产品流程，再通过研究协议配置，将其首次实例化为冰岛复杂自驾研究场景。

---

# 二、产品目标

## 2.1 核心目标

建立一个面向普通旅行者的轻量产品闭环，使用户能够：

1. 使用自然、低认知负担的方式表达旅行原则；
2. 理解同一目的地下不同路线策略的差异；
3. 基于收益与代价选择一条路线；
4. 通过真实规则发现一个高价值阻断问题；
5. 比较不同修复方案及其取舍；
6. 应用方案并重新验证行程；
7. 对「继续检查并修好整趟行程」作出真实使用或付费承诺。

## 2.2 产品验证目标

| 假设 | 验证问题 |
|------|----------|
| **H1 探索入口价值** | 用户是否需要 TripNARA 帮助其将模糊旅行意愿转化为一组可理解、可比较的路线策略 |
| **H2 路线取舍价值** | 用户是否能理解不同路线「得到什么、牺牲什么」，并因此获得更高的选择信心 |
| **H3 可靠性价值** | 用户是否重视 TripNARA 发现的具体、可信、可修复的旅行阻断问题 |
| **H4 决策价值** | 用户是否认为带有代价说明的多个修复方案，比简单风险提示更有价值 |
| **H5 商业承诺** | 用户是否愿意为继续检查、修复或保障整趟复杂旅行作出行为承诺 |

## 2.3 技术目标

在不复制现有领域模型、不建立第二套决策系统的前提下，完成：

* 通用路线策略模型；
* Consumer Exploration Flow Orchestrator；
* C 端展示适配层；
* 研究协议配置层；
* 现有 Canonical Runtime 接入；
* 完整研究事件与行为数据链路。

---

# 三、非目标

## 3.1 不建设完整目的地规划平台

冰岛仅作为第一套研究实例，底层接口不得只支持冰岛。

## 3.2 不建设完整签证服务

本期不包括签证材料审核、成功率预测、代办、全球签证数据库、护照与多国中转联合判断。

## 3.3 不建设完整天气动态重规划

本期不包括实时天气监控、自动行中重排、天气触发通知、多天气源融合。

## 3.4 不扩展团队协作与预算优化

不新增团队协商、多人投票、预算优化，且不将其作为研究 MVP 依赖项。

## 3.5 不建设完整 B 端 SaaS

本期只验证 B 端潜在楔子任务，不新增完整顾问工作台。

## 3.6 不验证全维度可执行性

本期一个真实 BLOCK 通过，不代表综合可执行性服务已成立、所有问题均可识别、所有目的地均可覆盖、所有用户愿意为完整报告付费。

---

# 四、用户与使用场景

## 4.1 核心用户

**目标用户 A：高复杂自由行用户** — 陌生目的地、自主规划、担心路线/交通/规则/季节问题、愿为减少重大错误投入时间或费用。

**目标用户 B：使用过 AI 规划工具的用户** — 希望获得比普通 AI 行程更可靠的方案。

**目标用户 C：购买过人工规划服务的用户** — 用于验证专家复核偏好、价格敏感度、人类背书需求。

## 4.2 首轮研究场景

| 条件 | 设定 |
|------|------|
| 目的地 | 冰岛 |
| 时长 | 9 天 |
| 出行月份 | 9 月 |
| 人数 | 2 名成人 |
| 预算 | 3,000—4,000 美元，不含国际机票 |
| 自驾车辆 | 初始为 2WD 紧凑型 SUV |
| 规划阶段 | 路线已开始选择，尚未完成预订 |
| 研究目标 | 选择路线、发现问题、比较修复、验证承诺 |

上述条件属于 **Research Protocol** 中的固定实验输入，不属于产品业务规则。

---

# 五、核心产品原则

## 5.1 流程通用化

正式产品流程不认识「冰岛研究」：

```text
旅行条件
→ 路线策略
→ 路线候选
→ 候选比较
→ 选择路线
→ 可执行性检查
→ 修复决策
→ 应用
→ 重新验证
```

## 5.2 研究配置化

默认目的地、日期、人数、预算、入口版本、展示问题数量、商品包装顺序、埋点、问卷、结束条件 — 均由 Research Protocol 配置，不得散落在页面组件和业务服务中。

## 5.3 目的地插件化

道路等级、车辆准入、季节开放、当地安全规则、官方数据源适配 — 放在 Destination Pack 中。全球通用运行时不得直接判断 `destination === Iceland`。

## 5.4 权威链路唯一化

所有问题发现、修复应用和重新验证必须经过现有权威链路：

```text
Destination Rule / World State
→ Constraint Evaluation Gateway
→ Feasibility Issue (via FeasibilityProjectionService)
→ DecisionProblem
→ DecisionOption
→ Apply (Write Guard)
→ Revalidate
```

研究 BFF 不得自行生成 BLOCK、绕过 Constraint Gateway、直接修改行程、在前端伪造已解决状态、复制规则判断。

## 5.5 前台语言轻量化

C 端不直接展示 Constraint、Enforcement、Rule Pack、Evidence Coverage、Decision Runtime、Objective Weight。用户看到的是：你更在意什么、这条路线适合什么人、你会得到什么、你必须接受什么、这里为什么走不通、可以怎么改。

---

# 六、产品整体架构

产品由四层组成。

## 6.1 Consumer Exploration Experience

旅行原则、探索入口、路线比较、路线详情、风险发现、修复方案、重新验证、商品包装与行为承诺。

## 6.2 Consumer Exploration Flow Orchestrator

负责探索规划流程编排：

```text
Principles
→ Strategy Profiles
→ Route Candidate Assembly
→ Candidate Comparison
→ Route Selection
→ Validation Request
```

**它不是第二 Planner，也不是新的决策运行时。**

### 允许职责

* Consumer Principles 到 Contract 的编排；
* 调用 Destination Pack 的区域模板；
* 调用现有路线装配或 Planner 子服务；
* 触发候选比较；
* 触发 Canonical 检查；
* 从 Unified ReadModel 中筛选适合 C 端展示的问题；
* 编排 Decision submit → apply → revalidate；
* 控制 Research Protocol 展示逻辑。

### 禁止职责

* 自行生成 BLOCK；
* 修改 Issue severity；
* 复制 Constraint Gateway 判断；
* 直接写入行程版本；
* 绕过 Write Guard；
* 复制 DecisionOption 生成逻辑；
* 创建独立的 Feasibility SSOT；
* 建立与 `route_and_run` 平行的规划内核。

### 与现有规划链路关系

Exploration 属于新的 **Consumer 入口**，但必须复用既有 Plan 子服务：

```text
Consumer Exploration Pipeline
→ shared Plan Generation / Assembly Service
→ Canonical Trip
→ Constraint Gateway
```

须在 [AGENT_UNIFIED_INTERFACE_SCOPE.md](../../src/agent/delivery/AGENT_UNIFIED_INTERFACE_SCOPE.md) 中登记，不得建立独立 Planner 实现。

## 6.3 Consumer Experience BFF

将专业领域对象转换为 C 端 ViewModel：

```text
Plan Variant        → Route Strategy Card
Feasibility Issue   → Consumer Risk Card
Decision Option     → Consumer Repair Option
```

### 唯一读源

```text
Gateway Assessment
→ FeasibilityProjectionService
→ Unified Decision ReadModel
→ Consumer Experience BFF
```

**不得**直接读取可能与 Gateway 不一致的 Legacy `FeasibilityReportService` 并自行裁决。

### BFF 允许

ViewModel mapper、i18n 文案 key 解析、展示过滤/排序、Research Protocol 的 maxIssues 限制、专业字段转 C 端语言。

### BFF 禁止

修改问题严重度、修改 workflowStatus、将 VERIFY 升级为 BLOCK、创建虚假 DecisionProblem、修改问题是否已解决、构造 Canonical issueId、读取多套评估结果并自行裁决。

**建议模块归属：** `src/trips/exploration/` 或 `src/consumer-experience/`。

## 6.4 Research Protocol Adapter

固定部分输入、分配入口版本、选择展示问题、随机包装顺序、记录研究事件、管理用户承诺、导出研究数据。

**建议归属：** 独立 `research/` 域；Session / Events / PII 分表存储。

## 6.5 双可行性路径收口 Gate（Sprint 3 前置 hard gate）

Exploration 接入可靠性流程前，须满足以下之一：

**方案 A（P0 推荐）：** Exploration BFF 经 `UnifiedDecisionProblemReadModelService` + Gateway evaluate 批次读取问题；issue 投影走已启用的 `FeasibilityProjectionService`（`DECISION_GATEWAY_UNIFIED=1` 及相关 projection flag）。

**方案 B（仅当 A 覆盖不足）：** 扩展既有 `FeasibilityProjectionService`，消除 Exploration 路径上对 legacy 评估的直读 — **不得**新建第二投影服务。

**禁止状态：** 若同一 Trip 在 Plan Studio、Feasibility Report、Exploration 看到不同的 BLOCK/PASS，则 Exploration 可靠性研究不得上线。

---

# 七、ExplorationScenario 与 Trip 生命周期

> V1.1 新增。置于领域模型之前，作为全链路权威键约定。

## 7.1 产品定位

`ExplorationScenario` 是一次探索流程的 **会话级上下文**，不是新的旅行计划权威实体。

职责包括：

* 保存探索阶段尚未正式形成 Trip 的轻量输入；
* 保存 Research Protocol 分配结果；
* 保存入口 Variant、临时原则选择和研究状态；
* 在用户需要生成路线候选前 **物化** 为 Canonical Trip。

## 7.2 Scenario → Trip 物化规则

```text
ExplorationScenario
        ↓ materialize()
Canonical Trip
        ↓
TravelDecisionContract
        ↓
Planner / Constraint Gateway / Decision Runtime
```

约束：

1. 一个 ExplorationScenario **最多物化一个** Canonical Trip；
2. 物化过程必须 **幂等**；
3. 重复调用不得创建 orphan Trip；
4. 物化后，所有路线候选、检查、问题、决策、Apply、Revalidate 均以 **`tripId`** 为权威键；
5. `scenarioId` 仅用于 Consumer Flow 与 Research Session 关联；
6. Scenario **不持有** 行程版本、问题状态或决策状态的写入权威。

## 7.3 Materialize 触发规则

| 接口 / 阶段 | 行为 |
|-------------|------|
| `POST /scenarios` | 创建 DRAFT Scenario，`tripId = null` |
| `PUT /principles` | **必须先已 MATERIALIZED**；推荐接口内部 **lazy materialize**（幂等），对外仍保留显式 materialize 供调试 |
| `POST /candidates` | 必须已 MATERIALIZED；未物化返回 `409` + 引导 materialize |
| `POST /check` 及之后 | 绑定 `tripId`，不再创建新 Trip |

## 7.4 建议字段

```ts
interface ExplorationScenario {
  scenarioId: string;
  tripId?: string;

  status:
    | 'DRAFT'
    | 'MATERIALIZING'
    | 'MATERIALIZED'
    | 'COMPLETED'
    | 'ABANDONED';

  researchProtocolId?: string;
  participantCode?: string;

  initialInput: ExplorationInput;
  assignedVariant?: ExploreEntryVariant;

  createdAt: string;
  materializedAt?: string;
}
```

## 7.5 Materialization API

```http
POST /api/exploration/scenarios/:scenarioId/materialize
```

响应：

```json
{
  "scenarioId": "scenario_123",
  "tripId": "trip_456",
  "tripVersion": 1,
  "decisionContractVersion": 1,
  "materialized": true,
  "idempotentReplay": false
}
```

---

# 八、核心领域模型

## 8.1 ExplorationScenario 输入

```ts
interface ExplorationInput {
  destinationCodes: string[];
  dateRange: { startDate: string; endDate: string };
  travelers: TravelerProfile[];
  budget?: BudgetRange;
  mobilityContext?: MobilityContext;
  source: 'USER_CREATED' | 'RESEARCH_PROTOCOL' | 'IMPORTED_ITINERARY';
}
```

## 8.2 Consumer Principle Card（原 TravelPrinciple）

> V1.1 修订：**不作为独立持久化业务模型。**

C 端展示的旅行原则是 **Consumer Principle Card** — `TravelDecisionContract` 的轻量表达和输入别名层。C 端原则不单独作为 SSOT 存储。

### 提交流程

```text
Consumer Principle Card
        ↓ Principle Mapping SSOT
TravelDecisionContract.objectives.rankedPrinciples
        +
相关 HARD / SOFT Constraint
```

### 示例映射

| C 端原则 | Contract 原则 | 关联约束 |
|----------|---------------|----------|
| 少赶路 | PACE | dailyDriveLimit、continuousDriveLimit |
| 不夜驾 | SAFETY | noNightDrive |
| 核心体验优先 | CORE_EXPERIENCE | protectedCorePoi |
| 更想探索小众区域 | COVERAGE / EXPERIENCE | remoteAreaPreference |
| 预算可适度增加 | BUDGET | budgetTolerance |
| 住宿稳定优先 | FEWER_HOTEL_CHANGES | stayChangePenalty |

首版 C 端可不暴露 `FLEXIBILITY`、`PHOTOGRAPHY` 等 Contract 枚举；映射表 Version 化。

### 映射 SSOT

归属 **`TravelDecisionContractPrincipleMappingService`**（Sprint 0.5 新建）。映射由 Consumer Principle、Destination Pack、用户上下文、Trip 阶段、默认产品策略共同决定。规则 **不得** 散落在前端或 Consumer BFF。

### 原则写入

```http
PUT /api/exploration/scenarios/:scenarioId/principles
```

内部流程：

1. 确认 Scenario 已物化为 Trip（或 lazy materialize）；
2. 读取当前 TravelDecisionContract；
3. 映射 Consumer Principles；
4. PATCH `contract.objectives.rankedPrinciples`；
5. 更新相关约束；
6. 返回 Consumer Principle ViewModel 与 Contract 版本。

## 8.3 RouteStrategy

```ts
interface RouteStrategy {
  strategyId: string;
  archetype:
    | 'DEPTH' | 'COVERAGE' | 'LOW_RISK' | 'LOW_DRIVING'
    | 'REMOTE_EXPLORATION' | 'COMFORT' | 'BUDGET';
  objectiveProfile: {
    exploration: number;
    coverage: number;
    comfort: number;
    drivingLoad: number;
    uncertainty: number;
    flexibility: number;
  };
  explanationKey: string;
}
```

## 8.4 RouteCandidate 与单 Trip 多 Variant 模型

> V1.1 新增：解决「每候选一个 Trip Version」与「一 Scenario 一 Trip」的表面张力。

**MVP 模型：**

* 一个 Scenario → **一个** Canonical Trip；
* 多个 `RouteCandidate` = 同一 Trip 下的多个 **plan variant / itinerary branch**；
* 用户 selection 后，将选中 variant **promote** 为 active itinerary version；
* 未选中 variant 保留为只读 branch，**不创建 orphan Trip**。

```ts
interface RouteCandidate {
  routeId: string;
  strategyId: string;
  variantId: string;       // branch within trip
  itineraryVersion: number;

  title: string;
  narrative: string;

  metrics: {
    exploration: number;
    drivingIntensity: number;
    experienceDensity: number;
    stayStability: number;
    flexibility: number;
    uncertainty: number;
  };

  gains: TradeoffItem[];
  sacrifices: TradeoffItem[];
  evidenceCoverage?: number;
}
```

## 8.5 ConsumerRiskViewModel

由 Canonical FeasibilityIssue 转换，仅用于展示：

```ts
interface ConsumerRiskViewModel {
  issueId: string;
  severity: 'BLOCK' | 'CONFLICT' | 'VERIFY' | 'OPTIMIZE';
  headline: string;
  explanation: string;
  consequence: string;
  affectedDay?: number;
  affectedSegmentLabel?: string;
  evidence: {
    sourceLabel: string;
    verifiedAt?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
  decisionRequired: boolean;
  source: ExplorationIssueSource;
}
```

## 8.6 ExplorationIssueSource（可靠性链路来源断言）

```ts
interface ExplorationIssueSource {
  gatewayAssessmentBatchId: string;
  canonicalIssueId: string;
  tripId: string;
  tripVersion: number;
  evidenceVersion?: string;
}
```

集成测试须断言：issue 来自 Gateway Assessment；`issueId` 与 Plan Studio / Decision Center 一致；BFF 未重新生成 issueId。字段名在 Sprint 0.5 与 `CanonicalConstraintReport` 响应对齐后冻结。

## 8.7 ConsumerRepairOptionViewModel

由 Canonical DecisionOption 转换：

```ts
interface ConsumerRepairOptionViewModel {
  optionId: string;
  title: string;
  summary: string;
  preserves: string[];
  sacrifices: string[];
  impact: {
    costDelta?: number;
    drivingDeltaMinutes?: number;
    experienceDelta?: number;
    riskDelta?: number;
  };
  canApply: boolean;
}
```

## 8.8 ResearchProtocol

```ts
interface ResearchProtocol {
  protocolId: string;
  version: string;
  defaultScenario: Partial<ExplorationInput>;
  lockedFields: string[];
  entryVariants: Array<
    'SINGLE_RECOMMENDATION' | 'THREE_ROUTE_COMPARISON' | 'THEME_FIRST'
  >;
  issueSelectionPolicy: {
    maxIssues: number;
    preferredSeverities: Array<'BLOCK' | 'CONFLICT'>;
    preferredCategories?: string[];
  };
  packagePresentationPolicy: {
    mode: 'LATIN_SQUARE' | 'RANDOM';
    packageIds: string[];
  };
  requiredEvents: string[];
  featureFlags: string[];
}
```

## 8.9 路线选择理由的数据归属

> V1.1 新增。

用户提交的「选择理由、最在意的收益、最能接受的代价、最担心的风险」**首先**属于 `ProductDiscoverySession`，不直接改变 Canonical 规划目标。

```ts
interface RouteSelectionResearchData {
  selectedRouteId: string;
  selectionReason?: string;
  prioritizedGainIds: string[];
  acceptedSacrificeIds: string[];
  concernText?: string;
}
```

**可选**将结构化摘要写入 `trip.metadata.explorationSelectionSummary`（Narrative、Decision 文案、再次进入探索时恢复上下文）。**禁止**将自由文本直接转为 HARD Constraint。

---

# 九、路线候选生成策略

## 9.1 本期实现方式

区域模板 + 策略参数 + 候选装配 + Canonical 验证。不要求首版实现通用最优路线算法。

## 9.2 Region Template DSL

三条冰岛研究路线必须来自 **同一套 DSL**，不得维护三个完全独立的 itinerary JSON：

```ts
interface RegionTemplate {
  templateId: string;
  destinationCode: string;
  regions: RegionNode[];
  routeSegments: RouteSegmentRef[];
  stayAnchors: StayAnchor[];
  constraints: TemplateConstraint[];
}
```

```ts
interface RouteStrategyProfile {
  strategyId: string;
  weights: {
    coverage: number;
    depth: number;
    drivingPenalty: number;
    remoteExploration: number;
    stayStability: number;
    uncertaintyPenalty: number;
  };
}
```

## 9.3 目的地区域模板（冰岛 Pack 示例）

South Coast、Golden Circle、Highlands、North Iceland、Westfjords、Ring Road、Reykjavík Base — 模板仅表达可组合区域，不代表最终用户路线。

## 9.4 策略驱动

| 策略 | 权重倾向 |
|------|----------|
| 深度 | 降低驾驶、提高单区域体验密度、减少换宿、减少区域覆盖 |
| 覆盖 | 提高区域覆盖、容忍更长驾驶、降低缓冲、提高行程密度 |
| 小众探索 | 提高偏远权重、容忍更高不确定性、提高车辆/季节要求 |

## 9.5 冰岛研究实例

| 策略 | 用户名称 | 说明 |
|------|----------|------|
| DEPTH + LOW_DRIVING | 南岸深度 | 少赶路，体验集中 |
| COVERAGE | 环岛压缩 | 覆盖更多区域，驾驶强 |
| REMOTE_EXPLORATION | 高地探索＋南岸 | 小众、高探索、高条件要求 |

由 `Research Protocol + Route Strategy + Iceland Region Templates → RouteCandidate` 生成，不得在前端写死。

## 9.6 Candidate 物化要求

每个候选必须：

* 作为真实 Trip 下的 variant branch 存在；
* 具有可追溯的 `variantId` / `itineraryVersion`；
* 能被 Constraint Gateway 检查；
* 能生成真实 `issueId`；
* 能调用现有 Decision Apply。

---

# 十、用户旅程

## 10.1 阶段一：开始探索 — `/explore`

研究模式下自动加载 Research Protocol 默认条件。展示目的地、时长、月份、人数、预算、规划阶段。引导：「先告诉我们，这次旅行你最想保留什么。」

## 10.2 阶段二：选择旅行原则 — `/explore/:scenarioId/principles`

六张原则卡片，最多选 3 项并排序。3 分钟内完成，可跳过。后台映射至 Contract（见 §8.2）。

## 10.3 阶段三：探索入口 — `/explore/:scenarioId/routes`

**Phase 1：** Variant A（单一推荐）、Variant B（三路线比较）。  
**Phase 2：** 样本量或定性条件满足后加入 Variant C（主题先行）。见 §十四。

## 10.4 阶段四：路线比较 — `/explore/:scenarioId/compare`

六维：探索感、驾驶强度、体验密度、住宿稳定性、路线弹性、不确定性。每维含结构化等级 + 一句解释 + 实际含义。

## 10.5 阶段五：路线详情 — `/explore/:scenarioId/routes/:routeId`

9 天时间轴、主路线地图、每天主题、驾驶时间、住宿区域、核心体验、原则匹配理由。本期不要求完整拖拽编辑。

## 10.6 阶段六：选择路线

用户提交路线、选择理由、收益与代价偏好。写入 Research Session；可选摘要进 Trip metadata。随后调用 Canonical 可执行性检查。

## 10.7 阶段七：风险发现 — `.../routes/:routeId/check`

Research Protocol 最多展示 **一个问题**（优先 BLOCK + ROAD_ACCESS / VEHICLE_ACCESS）。页面含：发现了什么、为什么是问题、影响哪里、不处理会怎样、信息来源、可以怎么处理。

`GET /issues` 须同时返回 `displayedIssues` 与 `totalIssueCount`，不得让用户误以为只发现一个问题。

## 10.8 阶段八：修复方案比较 — `/explore/:scenarioId/decisions/:problemId`

展示 Canonical DecisionOptions：保留/牺牲、成本/驾驶/体验/风险变化、是否可直接应用。

## 10.9 阶段九：应用与重新验证

submit → apply → 新行程版本 → Constraint Gateway → 更新问题状态 → 展示验证结果。必须展示「原问题是否解决 + 是否产生新问题」，不得仅显示「修改成功」。

## 10.10 阶段十：商品包装与行为承诺 — `/explore/:scenarioId/continue`

**Sprint 4A：** 商品卡、拉丁方顺序、价值/信任评分、开放价格、排序、NOTIFY_ME、SELF_CHECK。  
**Sprint 4B（条件触发）：** PRICE_LOCK、可退订金、独立 SKU、一键退款。

---

# 十一、页面与信息架构

| 路径 | 页面 |
|------|------|
| `/explore/:scenarioId/principles` | 旅行原则 |
| `/explore/:scenarioId/routes` | 探索入口（Variant 形态） |
| `/explore/:scenarioId/compare` | 路线比较 |
| `/explore/:scenarioId/routes/:routeId` | 路线详情 |
| `/explore/:scenarioId/routes/:routeId/check` | 风险发现 |
| `/explore/:scenarioId/decisions/:problemId` | 决策方案 |
| `/explore/:scenarioId/continue` | 继续保障 |

同一 trip 可深链至 Decision Center（研究员/debug），C 端默认不暴露。

---

# 十二、接口需求

## 12.1 创建 Scenario

```http
POST /api/exploration/scenarios
```

响应必须包含：

```json
{
  "scenarioId": "scenario_123",
  "sessionId": "research_session_123",
  "tripId": null,
  "materializationStatus": "DRAFT"
}
```

## 12.2 物化 Trip

```http
POST /api/exploration/scenarios/:scenarioId/materialize
```

## 12.3 保存旅行原则

```http
PUT /api/exploration/scenarios/:scenarioId/principles
```

## 12.4 获取路线策略

```http
GET /api/exploration/scenarios/:scenarioId/strategies
```

## 12.5 生成或装配路线候选

```http
POST /api/exploration/scenarios/:scenarioId/candidates
```

要求：幂等键、`generationVersion`、不创建 orphan Trip、候选绑定 Trip variant。

## 12.6 获取路线比较

```http
GET /api/exploration/scenarios/:scenarioId/candidates/compare
```

## 12.7 选择路线

```http
POST /api/exploration/scenarios/:scenarioId/selections
```

## 12.8 运行可执行性检查

```http
POST /api/exploration/scenarios/:scenarioId/check
```

内部必须调用 Canonical Feasibility Runtime。响应：P95 内 `200`；超时 `202 + jobId`。

```http
GET /api/exploration/check-jobs/:jobId
```

## 12.9 获取 C 端问题视图

```http
GET /api/exploration/scenarios/:scenarioId/issues
```

```json
{
  "displayedIssues": [],
  "totalIssueCount": 5,
  "displayPolicy": {
    "maxIssues": 1,
    "preferredSeverity": "BLOCK"
  }
}
```

Research Protocol 可限制展示数量，**不能**改变 Canonical 问题状态。

## 12.10 获取决策方案

```http
GET /api/exploration/scenarios/:scenarioId/issues/:issueId/options
```

## 12.11 提交决策

```http
POST /api/exploration/scenarios/:scenarioId/decisions/:problemId/submit
```

## 12.12 应用方案

```http
POST /api/exploration/scenarios/:scenarioId/decisions/:problemId/apply
```

**只代理**现有 Decision Gateway，不建立新 Apply 语义。Consumer 层隐藏 `executeDecision` / `persistDecision` 等专业参数，默认 `persistDecision: true`。

## 12.13 重新验证

```http
POST /api/exploration/scenarios/:scenarioId/revalidate
```

## 12.14 研究事件（批量）

```http
POST /api/research/events/batch
```

## 12.15 提交行为承诺

```http
POST /api/research/sessions/:sessionId/commitments
```

---

# 十三、研究模式

## 13.1 Feature Flag

```text
EXPLORATION_CONSUMER_MVP_ENABLED
RESEARCH_PROTOCOL_ENABLED          # 独立于 consumer MVP
RESEARCH_PAYMENT_COMMITMENT_ENABLED
```

## 13.2 Research Session

```ts
interface ProductDiscoverySession {
  sessionId: string;
  participantCode: string;
  protocolId: string;
  scenarioId: string;
  tripId?: string;

  entryVariant:
    | 'SINGLE_RECOMMENDATION'
    | 'THREE_ROUTE_COMPARISON'
    | 'THEME_FIRST';

  selectedPrinciples: string[];
  selectedRouteId?: string;
  routeSelection?: RouteSelectionResearchData;

  issueIdsViewed: string[];
  selectedDecisionOptionId?: string;
  decisionApplied?: boolean;
  revalidationResult?: string;

  packagePresentationOrder: string[];
  preferredPackageId?: string;

  commitmentType?: 'DEPOSIT' | 'PRICE_LOCK' | 'NOTIFY_ME' | 'SELF_CHECK';

  startedAt: string;
  completedAt?: string;
}
```

## 13.3 入口 Variant 分期

**Phase 1：** A（单一推荐）+ B（三路线比较）。  
**Phase 2：** 总样本量足够、A/B 表现不佳、定性访谈显示需主题先行、或独立实验可提供样本时，加入 C。

若三组同时测试：须注明为方向性研究，不做统计显著性结论，不宣称最优入口已确定。

## 13.4 问题选择策略

最多展示一个问题；优先 BLOCK；优先道路和车辆准入；须具备官方证据；须至少两个可执行修复方案。

若无符合条件问题：不得伪造；记录 `NO_ELIGIBLE_ISSUE`；允许切换 **RESEARCH_FIXTURE** 标准场景；UI 标注「标准化演示场景」。

## 13.5 研究 Fixture 边界

1. UI 标注「标准化演示场景」；
2. 数据、规则、路线均经核验；
3. Fixture 产生的 issue **仍须**走 Canonical Runtime；
4. 仅用于流程可用性与理解度测试；
5. **不得**用于 H3/H4 付费价值主结论；
6. 研究报告须区分用户动态场景 vs 标准 Fixture 场景。

## 13.6 商业承诺分期

**Sprint 4A（研究必需）：** 商品包装、拉丁方、价值/信任评分、开放价格、排序、NOTIFY_ME、SELF_CHECK、行为事件。

**Sprint 4B（支付验证）进入条件：** 法务文案、隐私与退款流程、支付 SKU、沙箱通过、4A 出现明确付费信号。包含 PRICE_LOCK、可退订金、独立研究 SKU、一键退款。

研究订金：明确产品尚在开发、无条件退款、不制造虚假稀缺、不使用误导倒计时。

---

# 十四、埋点体系

## 14.1 场景事件

`exploration_session_started`、`research_variant_assigned`、`principles_viewed`、`principle_selected`、`principles_submitted`

## 14.2 路线事件

`route_candidates_loaded`、`route_card_viewed`、`route_compare_started`、`route_dimension_expanded`、`route_detail_viewed`、`route_selected`、`route_selection_reason_submitted`

## 14.3 风险与决策事件

`feasibility_check_started`、`feasibility_check_completed`、`consumer_issue_viewed`、`issue_evidence_opened`、`repair_options_viewed`、`repair_option_selected`、`decision_submitted`、`decision_applied`、`revalidation_started`、`revalidation_completed`

## 14.4 商品与承诺事件

`package_card_viewed`、`package_rank_submitted`、`price_entered`、`commitment_option_selected`、`deposit_started`、`deposit_completed`、`price_lock_submitted`、`notify_me_submitted`、`self_check_selected`

## 14.5 数据要求

所有事件须含：`sessionId`、`participantCode`、`protocolId`、`entryVariant`、`scenarioId`、`tripId`（物化后）、`routeId`、`timestamp`、`currentStep`、`appVersion`。

---

# 十五、指标体系

## 15.1 探索入口

首次有效选择时间、继续深入意愿、适配感、决策信心、认知负担、后悔预期。

## 15.2 路线比较

查看候选数量、六维展开率、取舍复述正确率、选择理由完整度、路线选择完成率。

## 15.3 可靠性

问题理解率、风险感知强度、证据查看率、修复方案理解/选择率、应用完成率、重新验证完成率。

## 15.4 商业承诺

主分母 = 完成可靠性环节的全部用户。商品首选率、行为承诺率、订金启动/完成率、价格锁定率、自行检查率、中位可接受价格。

**行为承诺率进入下一阶段参考阈值：** ≥15%（任一种承诺）；订金完成率 ≥8% 为强信号（需基线校准）。

---

# 十六、权限与数据安全

研究数据与正式用户业务数据逻辑隔离。联系方式与行为日志分表，经匿名 sessionId 关联。研究支付与正式支付 **共用支付服务 + 独立 product SKU + 独立退款策略**。用户可撤回联系方式、删除研究记录、申请退款、撤销通知授权。

---

# 十七、验收标准

## 17.1 架构验收

* 不存在 `if destination === 'IS'` 直接生成问题的逻辑（CI lint / grep gate）；
* 冰岛实验条件由 Research Protocol 提供；
* F 路规则来自 Destination Pack；
* BLOCK 来自 Constraint Evaluation Gateway；
* 修复方案来自 Canonical Decision Runtime；
* Apply 经过 Write Guard；
* Revalidate 使用最新版本和最新证据。

## 17.2 产品验收

用户可在不进入 Plan Studio 的情况下完成：选原则 → 看路线 → 选路线 → 看问题 → 选修复 → 应用 → 重新验证 → 作出承诺。

## 17.3 体验验收

C 端不出现专业系统名词；路线卡片展示收益与代价；问题页展示原因、影响、证据；方案页展示保留与牺牲；重新验证明确问题状态变化。

## 17.4 研究验收

实验版本稳定分配；商品顺序按协议分配；全部事件可导出；用户行为可还原；付费转化率使用统一分母；失败/退出/异常均有记录。

## 17.5 技术集成验收

* 同一 `tripId` 在 Exploration 与 Plan Studio 的 BLOCK `issueId` 一致；
* 同一 DecisionProblem 在 Exploration 与 Decision Center 的 `problemId` 一致；
* Apply 后 Trip Version、`constraintsVersion` 递增可追溯；
* Revalidate 使用新 Trip Version 和最新证据；
* Research Session 可重放完整路径；
* `exploration/`、`consumer-experience/` 中无 `destination === 'IS'` / `countryCode === 'IS'`；
* 冰岛逻辑仅在 Destination Pack 与 Research Protocol；
* `/check` 返回的 issue 含 `gatewayAssessmentBatchId`。

## 17.6 研究完整性验收

* `NO_ELIGIBLE_ISSUE` 可导出；
* Fixture 与动态场景分层报告；
* `displayedIssues` 与 `totalIssueCount` 同时记录；
* Variant 分配、商品顺序、退出节点可回放；
* 研究结果不混合 Fixture 与动态检查用户行为。

---

# 十八、实施计划

```text
Sprint 0.5
→ Sprint 1
→ Sprint 2
→ Sprint 3
→ Sprint 4A
→ 条件满足后 Sprint 4B
```

## Sprint 0.5：权威链路 Gate（hard gate，未通过不得进入可靠性产品开发）

1. Scenario → Trip materialization 契约；
2. `TravelDecisionContractPrincipleMappingService` + 映射 SSOT；
3. Gateway Unified ReadModel + `FeasibilityProjectionService` 作为 Exploration 唯一读源；
4. Iceland Region Template DSL；
5. 端到端集成测试：2WD → F208 BLOCK → 2 options → apply → revalidate；
6. Consumer Exploration Pipeline 在 `AGENT_UNIFIED_INTERFACE_SCOPE.md` 登记。

### Sprint 0.5 集成测试断言清单

* `scenarioId` 全程可关联；materialize 后 `tripId` 不变；
* `PUT /principles` 后 Contract `rankedPrinciples` 与 Consumer 提交一致；
* `GET /issues` 在有多问题时 `totalIssueCount > displayedIssues.length`；
* Apply 后 `tripVersion` 递增；revalidation 为 PASSED 或 FAILED + 新 issue 列表；
* Research Session 可 replay：variant → principles → route_selected → issue_viewed → decision_applied → revalidation_completed。

## Sprint 1：通用模型与研究协议

ExplorationScenario、RouteStrategy、RouteCandidate、ResearchProtocol、ResearchSession、冰岛研究协议、Destination Pack 接口、三策略候选装配。

## Sprint 2：C 端探索流程

旅行原则页、探索入口 A/B、路线比较页、路线详情页、Consumer Experience BFF、路线选择与理由记录。

## Sprint 3：可靠性决策闭环

Canonical 检查接入、ConsumerRiskViewModel、ConsumerRepairOptionViewModel、决策方案页、Apply、Revalidate、状态更新。**依赖 Sprint 0.5 Gate。**

## Sprint 4A：研究与承诺（非支付）

四种商品包装、拉丁方、价格输入、留资、NOTIFY_ME、SELF_CHECK、研究数据导出。

## Sprint 4B：支付验证（条件触发）

可退订金、价格锁定、删除与退款能力。

---

# 十九、开发优先级

## P0

通用路线策略模型、Consumer Exploration Flow Orchestrator、C 端 BFF、冰岛 Research Protocol、三策略候选、单 BLOCK 动态检查、两类修复算子、Apply / Revalidate、研究 Session、全链路埋点、Sprint 0.5 Gate。

## P1

导入已有行程、多问题检查、时间冲突、住宿衔接、更多目的地包、专家复核后台、B 端质检试点、Variant C、Planner 生成替代纯模板装配。

## P2

全自动天气重规划、完整签证系统、多人协商扩展、新预算优化、通用代理执行、更多 Gate1 工作台、C 端专业约束控制台。

---

# 二十、风险与应对

| 风险 | 应对 |
|------|------|
| 研究配置演变成业务硬编码 | 固定输入进 Research Protocol；页面只读协议 |
| 固定路线无法体现真实规划能力 | 策略 + 区域模板装配；Canonical 真实检查 |
| 规则或证据错误破坏信任 | BLOCK 须有一手来源；无法核验标 VERIFY；研究前事实审计 |
| 新增一套领域模型 | Issue 只能是 ViewModel；DecisionOption 保持 Canonical |
| 平台能力失控扩展 | 冻结团队协作、预算优化、B 端扩展、新决策类型 |
| Exploration 成为第四套投影 | BFF 只读 Unified ReadModel；禁止新建 Issue SSOT |
| 原则双轨 | Consumer Principles 必须映射 Contract |
| 检查超时影响完成率 | SLA + 分阶段 loading UX（见 §二十一） |

---

# 二十一、性能与 Loading UX

| 操作 | P95 目标 |
|------|----------|
| 原则提交 | < 800ms |
| 路线候选读取 | < 2s |
| 路线比较 | < 1s |
| 可执行性检查 | < 5s（研究环境可放宽至 8s） |
| Apply | < 5s |
| Revalidate | < 8s（首版目标；研究环境可放宽至 12s） |

检查超过 3 秒须展示分阶段进度（核对路线结构 → 目的地规则 → 车辆道路条件 → 修复方案），**不得**展示虚假进度百分比。

---

# 二十二、内部评审决议摘要（V1.1）

| # | 议题 | V1.1 决议 |
|---|------|-----------|
| 1 | C 端最小闭环 | **是** — 探索规划 + 可靠性决策 |
| 2 | 不暴露专业约束控制台 | **是** — 只读折叠或深链 |
| 3 | 冰岛为研究实例非硬编码 | **是** — Research Protocol + Destination Pack |
| 4 | 三种探索入口 | **Phase 1：A+B；Phase 2：C** |
| 5 | 首轮只展示一个 BLOCK | **是** — 须记录 totalIssueCount |
| 6 | 新增 Orchestrator | **是** — Consumer Exploration Flow Orchestrator，窄职责 |
| 7 | Consumer BFF 归属 | **`trips/exploration` 或 `consumer-experience`** |
| 8 | Research Protocol 归属 | **独立 `research/` 域** |
| 9 | 模板装配 vs Planner | **MVP 模板装配**；P1 Planner |
| 10 | 标准 Fixture 兜底 | **是** — 透明标注，不用于 H3/H4 主结论 |
| 11 | Issue 唯一来源 | **是** — Gateway Assessment → Projection |
| 12 | DecisionOption 唯一权威 | **是** |
| 13 | Apply 走 Write Guard | **是** |
| 14 | Revalidate 版本+证据重检 | **是** |
| 15 | 功能冻结 | 团队协商、预算优化、B 端工作台、新决策类型 |
| 16 | 独立 research feature flag | **是** |
| 17 | 研究/正式支付 | **共用服务 + 独立 SKU + 独立退款** |
| 18 | 研究数据单独建表 | **是** |
| 19 | 行为承诺率阈值 | **≥15% 进入下一阶段参考；订金 ≥8% 强信号** |
| 20 | 探索不成立、可靠性成立 | **Pivot** — 导入行程 + 检查 |
| 21 | C 端不成立、B 端成立 | **Pivot** — 纯 B 端质检（Sprint 外决策） |

---

# 二十三、最终产品定义

本项目不是为冰岛开发三条固定路线和一个 F 路提醒页面。

本项目是：

> 建立一套通用的复杂旅行探索规划流程，通过目的地插件和 Canonical 决策运行时，帮助用户理解路线差异、发现真实阻断、比较修复代价，并完成可靠性决策。

冰岛研究模式只是该产品的第一个实例：

```text
通用探索流程
+ 通用路线策略
+ 冰岛目的地包
+ 冰岛研究协议
+ Canonical 决策运行时
= 冰岛 9 天探索规划研究 MVP
```

本阶段最终需要证明的不是系统能否生成更多功能，而是：

> 用户是否会因为 TripNARA 帮助其选对路线、发现未知问题并解释如何修复，而愿意继续使用或付费。
