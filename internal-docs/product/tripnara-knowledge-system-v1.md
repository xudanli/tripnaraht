# TripNARA Knowledge System — 7 层知识体系

**文档版本：** 1.0.0  
**状态：** 产品架构口径（冻结候选）  
**生效日期：** 2026-08-13  
**维护原则：** 本文定义知识体系**分层、职责边界、与决策链的关系**；Ontology 成熟度见 [travel-ontology-v05-maturity.md](./travel-ontology-v05-maturity.md)；执行计划（Phase 0–6）见 [tripnara-knowledge-system-execution-plan-v2.md](./tripnara-knowledge-system-execution-plan-v2.md)；Phase 0 盘点见 [knowledge-system-phase0-inventory.md](./knowledge-system-phase0-inventory.md)；后台见 [knowledge-control-center-admin-api.md](./knowledge-control-center-admin-api.md)；审计底稿见 [tripnara-knowledge-system-execution-checklist.md](./tripnara-knowledge-system-execution-checklist.md)；世界模型细节见 [travel-ontology-world-model-v1.md](./travel-ontology-world-model-v1.md)；能力边界见 [TRIPNARA-CAPABILITY-BOUNDARIES.md](./TRIPNARA-CAPABILITY-BOUNDARIES.md)。

---

## 0. 定位（先定目标，再定存储）

> TripNARA **不是**「旅行知识问答系统」，而是**旅行决策系统**。

知识体系围绕一个核心目标设计：

```text
世界是什么
  → 当前发生什么
  → 什么规则约束它
  → 这对当前用户意味着什么
  → 应该怎么决策
```

**最关键原则：**

> 知识体系不以「知识存储方式」设计，而以「一次旅行决策需要哪些知识」设计。

因此：**不要只做 4 层（Ontology / KG / Rules / Vector）**。  
应设计为 **「4 个知识底座 + 3 个运行时知识层」= 7 层**。

---

## 1. 总览图

```text
                         ┌──────────────────────────┐
                         │ ⑥ Traveler / Trip Context │
                         │ 用户 · 团队 · 行程 · 当前约束 │
                         └────────────┬─────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────┐
│              ⑦ Decision Knowledge Layer                      │
│     当前条件下：能不能去 / 值不值得去 / 怎么调整 / 为什么         │
│     Situation → Options → Evaluation → Decision → Outcome    │
└──────────────┬───────────────────────┬───────────────────────┘
               │                       │
       ┌───────▼───────┐       ┌───────▼────────┐
       │ ⑤ World State │       │ Decision Cases │
       │ 实时世界状态    │       │ （⑦ 的资产沉淀）  │
       └───────┬───────┘       └───────┬────────┘
               │                       │
════════════════════════════════════════════════════════════════
               │           ①–④ TripNARA Knowledge Base
               │
   ┌───────────┼─────────────┬──────────────┬───────────────┐
   ▼           ▼             ▼              ▼
① Ontology  ② Knowledge   ③ Rules &     ④ Semantic
   旅行本体     Graph         Constraints    Knowledge
              知识图谱        规则库          向量知识库
```

**服务统一过程：**

```text
① Ontology          → 理解世界里有什么
② Knowledge Graph   → 理解东西之间的关系
③ Rules             → 理解边界与代价
④ Semantic Knowledge→ 理解背景与经验叙述
⑤ World State       → 知道现在发生了什么
⑥ Traveler Context  → 知道对谁做决策
⑦ Decision Knowledge→ 知道过去什么决策有效
                ↓
         Decision Runtime
Observe → Diagnose → Generate → Evaluate → Gate
→ Recommend → Execute → Observe Outcome
```

---

## 2. 四层知识底座（Knowledge Base）

### ① Travel Ontology — 世界语言 / Schema

**职责：** 定义旅行世界「有哪些东西」，**不是**存实例数据。

**8 个一级 Domain（目标注册，非强制 OO 继承）：**

| Domain | 核心实体（目标） |
|--------|------------------|
| Geography | Country / Region / City / Zone / Corridor / Area |
| Place | POI / Attraction / Hotel / Restaurant / ServicePoint |
| Mobility | Road / RoadSegment / Route / Ferry / Flight / Vehicle |
| Activity | Hiking / Glacier / Diving / Ski / Tour / Experience |
| Time | OpeningWindow / Season / Daylight / Duration / TimeWindow |
| Environment | Weather / Wind / Snow / Visibility / RoadCondition |
| Traveler | Traveler / Group / Driver / Preference / Capability |
| Trip | Trip / Day / Stop / Booking / Task / Decision |

**抽象实体：** Constraint · Risk · Policy · Requirement · Evidence · Decision · Alternative · Outcome

**现状：** Ontology **V0.5 Decision Core**（实体契约 + WorldFact + ConstraintAssessment 已进决策链）。  
详见 [travel-ontology-v05-maturity.md](./travel-ontology-v05-maturity.md)。

**禁止宣称：** 完整 8 Domain + 深 `IS_A` taxonomy 已完成。

---

### ② Travel Knowledge Graph — 关系

**职责：** Ontology 定义「有什么」；KG 定义「东西之间是什么关系」。

**至少 7 类关系（与 V0.5 Relation Vocabulary 对齐，可扩展）：**

| 类 | 关系例 |
|----|--------|
| 空间 | `LOCATED_IN` · `NEAR` · `CONNECTED_TO` · `ON_ROUTE` · `BETWEEN` · `BELONGS_TO_CORRIDOR` |
| 行程 | `BEFORE` · `AFTER` · `CO_VISIT` · `SAME_DAY_FIT` · `DAY_TRIP_FROM` · `REQUIRES_BUFFER_AFTER` |
| 替代 | `ALTERNATIVE_TO` · `SOFT_ALTERNATIVE` · `HARD_ALTERNATIVE` · `SUBSTITUTE_WHEN` |
| 依赖 | `REQUIRES` · `INCOMPATIBLE_WITH` · `SUITABLE_FOR` |
| 可达 | （由路线/时间窗派生，可挂在边属性） |
| 因果 | `AFFECTS` · `INCREASES_RISK_OF` · `CAUSES` · `MITIGATES` |
| 类型 | `INSTANCE_OF` · `SUBCLASS_OF` |

**高价值形态（静态 → 决策图谱）：**

```text
Reynisfjara
  SUBSTITUTE_WHEN
weather.wind > threshold
```

**现状：** 无统一图库；有 CPRE / Spatial 路段连接 / Golden Set 共访 / POI 替代 fixture / 风险因果链 Admin。  
**缺口：** 统一 Relation Vocabulary + Identity 对齐（优先于上 Neo4j）。

---

### ③ Rules & Constraints — 可执行知识

**职责：** 不是「规则文本库」，而是**可执行约束与规划经验**。

| 类 | 含义 | 例 |
|----|------|-----|
| ① Physical | 物理不可违反 | F-road + 2WD → `HARD_BLOCK` |
| ② Safety | 安全阈值 | Wind > X + 高顶车 → `WARNING` / `BLOCK` |
| ③ Legal | 法规 / 准入 | Region + Vehicle + RoadType → AccessPolicy |
| ④ Temporal | 时间可达 | openingHours + arrivalTime → reachable |
| ⑤ Dependency | 依赖 | GlacierHike `REQUIRES` Booking / MinimumAge |
| ⑥ Planning Heuristic | 规划经验（软） | LongDrive > 4h + Outdoor → PacePenalty（Dr.Dre 类） |

```text
Rules = 世界规律 + 政策 + 安全约束 + 规划经验
```

**现状：** Destination Pack 规则、Constraint Gateway、Ontology 评估器、Guardian 人格策略较深（尤其冰岛自驾）。  
**真源：** Pack JSON + constraint registry + ontology evaluators；**不是** RAG 文本。

---

### ④ Semantic Knowledge / Vector Store — 传统 RAG

**职责：** 存放不适合结构化的叙述性知识。

| 类型 | 例 |
|------|-----|
| 攻略 | 冰岛冬季驾驶、冰川徒步、DOC、独库公路 |
| 官方文档 | Road.is、SafeTravel、景区/租车政策 |
| 用户经验 | 社区评价、踩坑、路线体验 |
| FAQ | 蓝湖多久订？老人是否适合冰川？ |

**硬边界（产品红线）：**

> **Vector Store 不得决定「能不能走」。**  
> 它只负责：解释 · 补充背景 · 经验召回 · 证据发现。

**Gate 真源：**

```text
Structured Facts + Rules + World State
（+ Traveler Context 调制「对谁」）
```

**现状：** Place embedding / RAG 文档 Admin / 道路约束 seed chunk；语料薄，通道有。

---

## 3. 三层运行时知识（Runtime Knowledge）

### ⑤ Dynamic World State — 世界「现在」是什么样

缺这一层，①–④ 只是**旅行知识库**，还不是 TripNARA。

**World State = 带时效的观测：**

```text
Entity + Property + Value + Timestamp + Freshness + Confidence + Source
```

```json
{
  "entity": "road:is:208",
  "property": "road_status",
  "value": "CLOSED",
  "observedAt": "2026-02-12T08:45:00Z",
  "source": "road.is",
  "confidence": 0.98,
  "freshness": "LIVE"
}
```

场景例：`2026-02-12 09:00` — R1 OPEN · F208 CLOSED · South Wind 17m/s · Reynisfjara OPEN · Vehicle 2WD · Traveler@Vík。

**现状对齐：**

| 资产 | 路径 |
|------|------|
| `TravelWorldFact` | `src/travel-ontology/contracts/travel-world-fact.types.ts` |
| `CanonicalWorldStateSnapshot` / `TravelWorldStateSnapshot` | `src/decision-runtime/contracts/world-state-snapshot.ts` |
| Trip World State 叙事 | [travel-ontology-world-model-v1.md](./travel-ontology-world-model-v1.md) §16 |

**缺口：** 多源 SSOT 仍部分双轨（`WorldModelContext` vs Ontology facts）；过期事实 re-eval 未全闭合。

---

### ⑥ Traveler & Trip Context — 「对谁」做决策

**不得**与世界知识混为一谈。同一 World State 下，不同旅行者决策不同：

| 活动 | 20 岁户外爱好者 | 70 岁长辈同行 |
|------|-----------------|---------------|
| 徒步 3h | ALLOW | SUGGEST_REPLACE |

内容例：怕累 / 摄影偏好 / 不愿连续换酒店 / 雪地驾驶经验少 / 同行有老人 / 当前车 2WD。

**现状对齐：**

| 资产 | 路径 |
|------|------|
| Traveler Memory | `src/travel-memory/` |
| `EffectiveTravelerContext` | `src/travel-memory/effective-context/` |
| Trip Context / RFC-003 | `src/travel-context/`、[rfc-travel-context-protocol-v1.md](./rfc-travel-context-protocol-v1.md) |

---

### ⑦ Decision Knowledge — 最应建立的资产层

传统旅游产品停在 POI / Guide / Rules。TripNARA 应积累：

```text
Situation → Options → Evaluation → Decision → Outcome（+ Regret）
```

例：

```text
Situation: South Iceland · Wind 18m/s · 2WD · Day4 · 必须晚抵 Höfn
Option A: 继续 Reynisfjara
Option B: 跳过，提前向东
Decision: B
Outcome: 准时 · 无高风险驾驶 · 用户接受
Regret: LOW
```

长期形成：**类似情形下，什么方案更被接受、效果更好** —— 这才是旅行决策资产，而不是多存 10 万篇攻略。

**现状对齐：**

| 资产 | 路径 |
|------|------|
| `DecisionEpisodeV1` | `src/travel-memory/episode/decision-episode.types.ts` |
| Outcome reconciliation | `src/travel-causal-decision/reconciliation/` |
| 强风 pilot / harness | `src/travel-causal-decision/pilot/iceland-wind/` |
| 执行风险因果配置 | `/api/admin/execution-risk/knowledge/.../causal-chains` |

**缺口：** Episode 尚未成为跨行程可检索的 Decision Knowledge Base；多为单次闭环 / pilot。

---

## 4. 与旧「4 层图」的关系

| 旧图 | 新定位 |
|------|--------|
| Ontology + KG + Rules + Vector | **保留为 Knowledge Base ①–④** |
| （缺失） | **补** ⑤ World State · ⑥ Traveler/Trip Context · ⑦ Decision Knowledge |

```text
旧：Travel RAG / 知识存储视角
新：Travel Decision Intelligence（决策所需知识视角）
```

---

## 5. 当前成熟度速览（工程对照）

| 层 | 约完成度 | 判断 |
|----|----------|------|
| ① Ontology | 决策 Core ~2/3；世界建模 ~1/3 | V0.5；见成熟度文档 |
| ② Knowledge Graph | ~15–25% | 关系散落；无统一词表 / 图库 |
| ③ Rules | ~60–75%（IS 自驾更深） | Pack + Gateway 可执行；启发式分散 |
| ④ Semantic / Vector | ~20–30% | 基础设施有；语料薄；**不得 Gate** |
| ⑤ World State | ~55–70% | Snapshot + Fact 有；SSOT 双轨未清 |
| ⑥ Traveler/Trip Context | ~50–65% | Memory + ETC 有；未全量调制所有 Gate |
| ⑦ Decision Knowledge | ~25–40% | Episode / Outcome 契约有；尚未成库 |

---

## 6. 演进优先级（与 Ontology V0.5 对齐）

| 优先级 | 知识层动作 | 说明 |
|--------|------------|------|
| **P0** | ⑤ 事实进 Snapshot 单一 SSOT + ① Identity（CPRE 扩面） | 决策正确性前提 |
| **P1** | ③ 规则可执行面稳定（Gateway DEFAULT_ON 场景）+ ② 最小 Relation Vocab | 尤其 `ALTERNATIVE_TO` / `REQUIRES` / `AFFECTS` |
| **P2** | ⑥ Context 强制进入 Evaluate/Gate 调制 | 同一世界、不同人不同结果 |
| **P3** | ⑦ Decision Episode 沉淀与检索 | Situation→Outcome 可复用 |
| **P4** | ④ Semantic 扩容（官方+FAQ） | 仅解释/证据，永不直连 BLOCK |
| **并行谨慎** | ① Domain metadata / 轻量 Taxonomy | 规则需要继承时再补 |

**禁止：** 为「知识图谱完整」推翻已进决策链的 Contract / Pack / Gateway。

---

## 7. 对外表述（冻结）

**推荐：**

> TripNARA 的知识体系以旅行决策为目标，由四层知识底座（Ontology、Knowledge Graph、Rules、Semantic Knowledge）与三层运行时知识（World State、Traveler/Trip Context、Decision Knowledge）构成，支撑从「理解世界」到「对当前用户做出可验证决策」的完整链路。

**禁止：**

- 「TripNARA 是旅行知识问答 / RAG 产品」
- 「Vector / 攻略库决定能不能走」
- 「已建成完整旅行知识图谱」

**对内补一句：**

> 底座回答「世界与规则」；运行时回答「现在、对谁、过去怎样决策」；缺后三层就只是 Travel RAG。

---

## 8. 相关文档与代码

| 主题 | 文档 / 代码 |
|------|-------------|
| Ontology V0.5 | [travel-ontology-v05-maturity.md](./travel-ontology-v05-maturity.md) |
| World Model / Trip World State | [travel-ontology-world-model-v1.md](./travel-ontology-world-model-v1.md) |
| 能力边界 | [TRIPNARA-CAPABILITY-BOUNDARIES.md](./TRIPNARA-CAPABILITY-BOUNDARIES.md) |
| CPRE Identity | [prd-cpre-v1.md](./prd-cpre-v1.md) |
| Traveler Memory | `src/travel-memory/TRAVEL_MEMORY_API.md` |
| Admin 知识接口 | [ADMIN_API_GUIDE.md](../../src/admin/ADMIN_API_GUIDE.md)、[ADMIN_RISK_KNOWLEDGE_API.md](../../src/trips/execution-risk-center/ADMIN_RISK_KNOWLEDGE_API.md) |
| Decision Runtime | `src/decision-runtime/` |
| Causal Decision | `src/travel-causal-decision/` |
