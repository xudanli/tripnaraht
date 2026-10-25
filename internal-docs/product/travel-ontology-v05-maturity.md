# Ontology V0.5 — Decision-oriented Travel Ontology Core

**文档版本：** 1.0.0  
**状态：** 产品 / 工程成熟度口径（冻结候选）  
**生效日期：** 2026-08-13  
**维护原则：** 本文定义 **当前完成度、缺口优先级、对外表述**；实体契约细节以 [travel-ontology-world-model-v1.md](./travel-ontology-world-model-v1.md) 为准；知识体系总览（4 底座 + 3 运行时）以 [tripnara-knowledge-system-v1.md](./tripnara-knowledge-system-v1.md) 为准；能力边界以 [TRIPNARA-CAPABILITY-BOUNDARIES.md](./TRIPNARA-CAPABILITY-BOUNDARIES.md) 为准。

**相关实现：**

| 层 | 路径 |
|----|------|
| 实体契约 | `src/travel-ontology/contracts/core-entities.types.ts` |
| 事实模型 | `src/travel-ontology/contracts/travel-world-fact.types.ts` |
| 约束评估 | `src/travel-ontology/contracts/constraint-assessment.types.ts`、`evaluators/` |
| Place Identity（已有子集） | `src/canonical-poi-resolution/`（[prd-cpre-v1.md](./prd-cpre-v1.md)） |
| 因果配置（关系雏形） | `/api/admin/execution-risk/knowledge/.../causal-chains` |

---

## 0. 一句话定义

> **Ontology V0.5** = 面向旅行决策的显式 Travel Ontology Core：  
> 已有「决策所需实体 + 事实表达 + 约束评估」，缺的是「统一世界分类体系 + 类型继承 + 跨域关系」。

**不是：** 完整旅游知识分类学 / 深 taxonomy 知识图谱。  
**是：** Entity / Type / Relation / Fact / Constraint 的统一语义协议（逐步演进）。

---

## 1. 完成度分层（不要压成单一百分比）

| 层级 | 当前完成度 | 判断 |
|------|------------|------|
| 实体契约 Entity Contracts | **~70%** | `Driver` / `RentalVehicle` / `RouteSegment` / Weather 暴露 / `NaturalHazard` / `ActivityCapability` / 合同·保险·入境等核心决策实体已有 |
| 事实表达 Fact Model | **~80%** | `TravelWorldFact(subject, predicate, value)` 已形成通用事实底座 |
| 约束 / 风险模型 | **~70%** | `ConstraintAssessment`、`NaturalHazard`、`EntryEligibility` 等已进入真实决策链 |
| 旅行领域覆盖 | **~40%** | 自驾、安全、天气较深；Place / Hotel / Restaurant / Flight 等作为 Ontology 一等类较弱 |
| 统一 Domain Schema | **~20%** | 无真正统一的 8 Domain 注册与治理 |
| Taxonomy / IS_A | **~10%** | 基本缺失（无 `INSTANCE_OF` / `SUBCLASS_OF` 协议） |
| 统一关系语义 | **~20%** | 各模块有隐式关系；无统一 Relation Vocabulary |
| 完整 Travel World Ontology | **~30–40%** | 还不能称「完整旅行世界本体」 |

### 双轨读法（对外必用）

| 轨道 | 完成度 | 含义 |
|------|--------|------|
| **决策运行所需 Ontology** | **大半已完成（约 2/3+）** | 能支撑 Gate / Decision Runtime 的实体→事实→约束闭环 |
| **世界建模 Ontology** | **约三分之一** | 统一 Identity + Type + Relation 语言尚未成型 |

> 不要说「Ontology 只完成 30%」。  
> 更准确：**决策 Ontology Core 已大半落地；世界语义体系约 1/3。**

---

## 2. 现有骨架（保留，不推翻）

```text
Driver
RentalVehicle
RouteSegment
RouteWeatherExposure / DaylightWindow
NaturalHazard
ActivityCapability
RentalContract
InsurancePolicy
EntryEligibility
        ↓
  TravelWorldFact
        ↓
  ConstraintAssessment
        ↓
  Gate / Decision Runtime
```

**价值主张：** 不是为「知识漂亮」而设计，而是进入决策链。

```text
RouteSegment + Vehicle + Weather + Hazard
        ↓
  WorldFact
        ↓
  Constraint
        ↓
  ALLOW / WARNING / BLOCK
```

这比先建巨大的 `Thing → Place → Attraction → …` 再不知道如何服务产品，**更有价值**。  
**现阶段禁止为「架构完整」做大 Ontology 重构。**

---

## 3. Ontology 重新定义（目标形态）

TripNARA Ontology **不是**一套庞大的旅游知识分类学，而是：

> **对旅行决策世界中 Entity、Type、Relation、Fact、Constraint 的统一语义协议。**

```text
Travel Ontology
│
├── Entity          （决策对象：Traveler / Place / Route / Vehicle / Activity / Environment / Trip …）
├── Type            （INSTANCE_OF / SUBCLASS_OF — 轻量即可）
├── Relation        （Spatial / Temporal / Dependency / Alternative / Causal）
├── Fact            （subject + predicate + value）
└── Constraint      （condition → assessment）
```

### 能力条（示意）

```text
Entity      ███████░░░  ~70%
Fact        ████████░░  ~80%
Constraint  ███████░░░  ~70%
Type        ██░░░░░░░░  ~10%
Relation    ███░░░░░░░  ~20%
```

**最大短板不是「实体种类不够多」，而是：已有实体尚未统一成同一套 Identity + Type + Relation 语言。**

---

## 4. 真正缺的 4 件事

### 4.1 Unified Domain Registry（metadata，非 class 继承树）

建议一级 Domain（概念注册，非强制 OO 继承）：

| Domain | 用途 |
|--------|------|
| `TRAVELER` | 旅行者 / 团体 / 驾驶人 / 能力 |
| `GEOGRAPHY` | 国家 / 区域 / 走廊 |
| `PLACE` | POI / 住宿 / 餐饮 / 服务点 |
| `MOBILITY` | 道路 / 路段 / 路线 / 车辆 / 交通工具 |
| `ACTIVITY` | 活动与体验 |
| `TIME` | 开放窗 / 季节 / 日照 / 时长 |
| `ENVIRONMENT` | 天气 / 风雪 / 能见度 / 路况 |
| `TRIP` | 行程 / 日 / 停靠 / 预订 / 决策 |

最小落地形态（推荐）：

```json
{
  "type": "RouteSegment",
  "domain": "MOBILITY",
  "canonicalEntityId": "segment:is:f208:kjolur"
}
```

核心价值：系统知道 `RouteSegment ∈ MOBILITY`，而不是靠开发者记忆。  
**不要求** `class Place extends Geography`。

### 4.2 Type System / Taxonomy（只做两层）

协议仅锁：

- `INSTANCE_OF`
- `SUBCLASS_OF`

示例：

```text
Reynisfjara          INSTANCE_OF  Beach
Beach                SUBCLASS_OF  NaturalAttraction

GlacierHike          INSTANCE_OF  GuidedOutdoorActivity
GuidedOutdoorActivity SUBCLASS_OF Activity
```

规则可写在类型上，而非逐 POI：

```text
IF Activity INSTANCE_OF GuidedOutdoorActivity
THEN requiresBooking = likely
```

**禁止**先铺完整旅游世界深 taxonomy。

### 4.3 Relation Vocabulary（先锁 5 组）

| 组 | 关系 |
|----|------|
| **类型** | `INSTANCE_OF` · `SUBCLASS_OF` |
| **空间** | `LOCATED_IN` · `NEAR` · `CONNECTED_TO` · `ON_ROUTE` |
| **行程** | `CO_VISIT` · `BEFORE` · `AFTER` · `DAY_TRIP_FROM` |
| **决策** | `ALTERNATIVE_TO` · `REQUIRES` · `INCOMPATIBLE_WITH` · `SUITABLE_FOR` |
| **因果** | `AFFECTS` · `INCREASES_RISK_OF` · `CAUSES` · `MITIGATES` |

因果示例（正式表达）：

```text
HighWind      INCREASES_RISK_OF  VehicleInstability
Snow          AFFECTS            RoadCondition
RoadClosure   CAUSES             RouteUnavailable
```

现状：Golden Set / Destination Pack / constraint / route / POI 中已有隐式关系；执行风险知识库的 `causal-chains` 是因果组的配置雏形，**尚未**升格为统一 Relation Vocabulary。

### 4.4 Entity Identity（优先于漂亮分类树）

问题：`Reynisfjara` / `Reynisfjara Beach` / `Black Sand Beach` / `雷尼斯黑沙滩` 是否同一实体？

目标：`canonical_entity_id`，例如 `place:is:reynisfjara`，被 POI DB / WorldFact / KG / Vector / Trip Item 共同引用。

**已有资产（Place 子集）：** CPRE（`src/canonical-poi-resolution/`）已提供 `poiId` 作为地点 Travel Primary Key，冰岛种子与别名链路存在；**尚未**覆盖 Vehicle / RoadSegment / Activity / Hazard 等跨类 Identity，也尚未强制所有 WorldFact / Pack / Vector 文档统一指向同一 ID 空间。

> 对运营期产品，**Identity 的实际价值通常高于深 Taxonomy。**

---

## 5. 演进顺序（禁止大重构）

```text
现有 Contract（保留）
      ↓
P0  Canonical Entity ID（先 Place 收敛，再扩 Mobility / Activity）
      ↓
P1  统一 Relation Vocabulary（先决策 + 因果 5–8 个谓词）
      ↓
P2  Domain / EntityType metadata 注册
      ↓
P3  轻量 Taxonomy（仅当规则确实需要继承时）
```

| 优先级 | 做什么 | 不做 |
|--------|--------|------|
| **P0** | Entity Identity：CPRE 扩面 + WorldFact / Trip / Pack 对齐 `canonical_entity_id` | 推翻现有 contracts |
| **P1** | Relation Vocabulary：优先 `ALTERNATIVE_TO` / `REQUIRES` / `LOCATED_IN` / `AFFECTS` / `CO_VISIT` | 新建完整图数据库 |
| **P2** | Domain / Type Registry：给已有实体打 `domain` + `type` metadata | 8 Domain 全量内容灌库 |
| **P3** | 轻量 Taxonomy：按决策规则需要补 `SUBCLASS_OF` | 一次性分类整个旅游世界 |

---

## 6. 对外表述（冻结）

**推荐：**

> TripNARA 已建立面向旅行决策的显式 Travel Ontology Core，通过结构化实体契约、WorldFact 和 Constraint Model 描述旅行者、车辆、路线、天气、风险与活动能力等关键决策对象；目前正在从「决策实体模型」逐步演进为统一的旅行世界语义体系。

**禁止：**

- 「TripNARA 已经拥有完整 Travel Ontology」
- 「现在只有一些 TypeScript interface」（低估已进入决策链的资产）

**允许补一句缺口（对内 / 技术伙伴）：**

> 现阶段最大短板不是实体种类不够，而是 Identity + Type + Relation 尚未统一成同一套语言。

---

## 7. 与既有文档关系

| 文档 | 关系 |
|------|------|
| [travel-ontology-world-model-v1.md](./travel-ontology-world-model-v1.md) | 架构与目标实体 SSOT；本文是**成熟度与演进口径** |
| [travel-ontology-world-model-p0-gap-backlog.md](./travel-ontology-world-model-p0-gap-backlog.md) | 冰岛可执行性领域缺口；本文不替代其工程 backlog |
| [prd-cpre-v1.md](./prd-cpre-v1.md) | Place Identity 的 P0 已有实现；本文将其升格为跨系统 Identity 战略的一部分 |
| [TRIPNARA-CAPABILITY-BOUNDARIES.md](./TRIPNARA-CAPABILITY-BOUNDARIES.md) | 对外能力边界；Ontology 表述须与本文 §6 一致 |

---

## 8. 验收探针（后续开 issue 可用）

| ID | 探针 | Pass 条件 |
|----|------|-----------|
| ONT-ID-01 | 同一 POI 多别名 | CPRE → 同一 `canonical_entity_id`；WorldFact.subjectId 一致 |
| ONT-REL-01 | 强风场景 | 因果链可用标准谓词 `INCREASES_RISK_OF` / `AFFECTS` 表达（配置或 Fact） |
| ONT-DOM-01 | RouteSegment | 元数据含 `domain=MOBILITY` + `type=RouteSegment` |
| ONT-TAX-01 | GuidedOutdoorActivity | 至少 1 条规则按 `INSTANCE_OF` 继承触发，而非硬编码单个活动 ID |
