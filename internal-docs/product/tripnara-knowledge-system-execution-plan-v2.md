# TripNARA Knowledge System — 执行计划（Phase 0–6 · 双线）

**文档版本：** 2.0.0  
**状态：** 执行 SSOT（取代 Sprint A–D 并行排期）  
**生效日期：** 2026-08-13  
**上位：** [tripnara-knowledge-system-v1.md](./tripnara-knowledge-system-v1.md) · [travel-ontology-v05-maturity.md](./travel-ontology-v05-maturity.md)  
**后台：** [knowledge-control-center-admin-api.md](./knowledge-control-center-admin-api.md)  
**Phase 0 盘点：** [knowledge-system-phase0-inventory.md](./knowledge-system-phase0-inventory.md)  
**旧清单：** [tripnara-knowledge-system-execution-checklist.md](./tripnara-knowledge-system-execution-checklist.md)（v1 保留作审计底稿；**排期以本文为准**）

---

## 0. 执行原则

> TripNARA 不是旅行问答 RAG，而是 Decision-first 系统。  
> **最大瓶颈 = Identity + World State SSOT 双轨**，不是缺 Neo4j / 实体种类。

### 两条线（串行依赖，后台可滞后一拍）

| 线 | 目标 | 原则 |
|----|------|------|
| **运行时收敛线** | Decision Runtime 用的是**统一知识** | Evaluate / Gate / Constraint / CGUS 只认 Canonical ID + Snapshot.worldFacts + ETC |
| **后台治理线** | Admin 能「看、查、校验、修正、发布」 | **Knowledge Control Center**，不是大知识图谱编辑器 |

**禁止：** Sprint A–D 并行；Entity ID 未统一就建 Relation 库；World State 双轨下沉淀 DecisionCase。

---

## 1. 总序（严格串行）

```text
Phase 0  现状盘点 / 冻结契约          （不改业务代码）
   ↓
Phase 1  Canonical Identity           （运行时 + Entity Registry Admin）
   ↓
Phase 2  World State SSOT             （运行时 + World State Inspector）
   ↓
Phase 3  Vocabulary / Relation        （Adapter 投影 + Relation Admin 表）
   ↓
Phase 4  Traveler Context 收口        （ETC 唯一读 + Context Inspector）
   ↓
Phase 5  Decision Knowledge           （Episode→Case + Decision Admin）
   ↓
Phase 6  Semantic / Admin 完善        （轻量 RAG 治理 + Health Overview）
```

| 若跳过… | 后果 |
|---------|------|
| Phase 1 做 Relation | 关系边以后整表迁移 |
| Phase 2 做 DecisionCase | Situation 引用的不是同一世界状态 |
| 先做酷炫图可视化 | 运营价值低，延迟 SSOT |

---

## 2. 研发批次 ↔ 后台模块

| 批次 | Phase | 运行时收敛 | 后台治理（滞后可接受） |
|------|-------|------------|------------------------|
| **第 1 批** | 0→1 | Identity Adapter；resolve API；写入校验 | Entity Registry · Resolve Debug · Unresolved |
| **第 2 批** | 2 | Snapshot SSOT；禁新路径读 WorldModelContext；stale re-eval | Snapshots · Facts · Stale · Diff |
| **第 3 批** | 3 | Relation Vocab + 3 Adapter 投影 | Relation Explorer · Vocabulary · Projections |
| **第 4 批** | 4 | ETC ACTIVE 进 Gate；禁多源直读 | Traveler Context Inspector · ETC Diff |
| **第 5 批** | 5 | DecisionCase Projector + 持久化 | Decision Cases · Similar（SQL） |
| **第 6 批** | 6 | （可选）retrieval 标注 VERIFIED | Documents 轻量 · Health Overview |

**前两批做完** → 才算开始有统一 Knowledge System。  
**第三批做完** → 才有统一图谱**语义**（仍无 Neo4j）。  
**第五批做完** → 才有长期 Decision Knowledge。

---

## 3. Phase 详解

### Phase 0 — Knowledge Inventory（当前）

**不做：** 改业务代码、上库、Admin 实现。

**交付：** [knowledge-system-phase0-inventory.md](./knowledge-system-phase0-inventory.md)

| 表 | 内容 | 对应旧项 |
|----|------|----------|
| Entity Inventory | 类型 / 当前 ID / 来源 / Canonical 规则 / 是否迁移 | A1, A3 |
| Predicate Inventory | 全量 predicate 扫描 + 同义冲突 | — |
| Relation Inventory | Golden Set / spatial / causal / requires → 目标 Vocab | B2 准备 |

**冻结：** Place 继续 CPRE `is.slug`；不发明并行 `place:is:` 除非写 alias 映射。

---

### Phase 1 — Canonical Entity Identity

**不做：** Entity Database 替换所有 DB 主键；大规模 taxonomy。

**做：**

```text
旧 ID  →  Identity Adapter  →  CanonicalEntityId
```

```typescript
interface EntityIdentity {
  canonicalEntityId: string;
  entityType: string;
  domain: KnowledgeDomain;
  aliases?: string[];
  sourceRefs?: Array<{ system: string; sourceId: string }>;
}

resolve(sourceSystem, sourceId) → canonicalEntityId
resolveAlias(alias) → canonicalEntityId
```

| 任务 | 说明 |
|------|------|
| 1.1 | `EntityIdentity` 契约 + Registry（内存/JSON 起步可） |
| 1.2 | Place：CPRE 为真源；`POI:` / TripItem 映射 |
| 1.3 | Segment / Vehicle / Activity / Hazard 命名空间约定 + adapter |
| 1.4 | WorldFact 写入：Place 类 subjectId 必须可 resolve（IS 先） |
| 1.5 Admin | `GET/POST .../entities*` · `resolve` · `unresolved` |

**验收：** `CPRE:is.reynisfjara` / `POI:poi_*` → 同一 `is.reynisfjara`；Unresolved 列表可运营。

---

### Phase 2 — World State SSOT

**目标形态：**

```text
Providers → WorldFacts → CanonicalWorldStateSnapshot → Decision Runtime

Legacy WorldModelContext → adapter → CanonicalWorldStateSnapshot
```

**新代码只允许：** `snapshot.worldFacts`  
**禁止：** `worldModelContext.weather` 等旁路作为 Gate 输入。

| 任务 | 说明 |
|------|------|
| 2.1 | Evaluate / Gate / Constraint / CGUS 新路径只读 Snapshot |
| 2.2 | WorldModelContext → Snapshot adapter；legacy 标注 |
| 2.3 | Stale fact：TTL 外不参与 BLOCK 或强制 re-eval |
| 2.4 Admin | snapshots / facts / stale-facts / diff |

**验收：** 同一 trip 两次 Gate 同 `snapshotId`；Diff 可见 ROAD OPEN→CLOSED。

---

### Phase 3 — Relation Vocabulary（仍非图库）

**V1 只锁 12 个：**

```text
LOCATED_IN · NEAR · CONNECTED_TO · ON_ROUTE
CO_VISIT · ALTERNATIVE_TO · SOFT_ALTERNATIVE
REQUIRES · INCOMPATIBLE_WITH · SUITABLE_FOR
AFFECTS · INCREASES_RISK_OF
```

`INSTANCE_OF` / `SUBCLASS_OF`：**契约可有，不建 taxonomy。**

| Adapter | 源 → |
|---------|------|
| Golden Set | `CO_VISIT_CLUSTER` → `CO_VISIT`；`SOFT_ALTERNATIVE` → `SOFT_ALTERNATIVE` |
| POI Alternatives | → `ALTERNATIVE_TO` / `SOFT_ALTERNATIVE` |
| Causal Chains | → `AFFECTS` / `INCREASES_RISK_OF` |
| Spatial segments | → `CONNECTED_TO` / `ON_ROUTE` |

**不改** Pack 原文件结构；只投影。

| 任务 | 说明 |
|------|------|
| 3.1 | `KnowledgeRelation` 契约 + RelationType 常量 |
| 3.2–3.5 | 四个 Adapter（只读投影） |
| 3.6 | Domain/EntityType registry metadata（手写） |
| 3.7 Admin | relations · vocabulary · projections |

**DEFER：** Neo4j / GraphRAG / 节点图可视化。

---

### Phase 4 — Traveler Context 收口

```text
Memory + Trip Override + User input + Team + Vehicle
        ↓
EffectiveTravelerContext
        ↓
Evaluate / Gate
```

**禁止：** Gate 读 ETC、CGUS 读 Memory、Constraint 再读 `trip.metadata` 三套并行。

| 任务 | 说明 | 状态 |
|------|------|------|
| 4.1 | 选中场景 ETC `ACTIVE`（env `EFFECTIVE_TRAVELER_CONTEXT_CONSUME`） | ✅ coverage + health 指标 |
| 4.2 | Override 进评估输入；`assertGateReadsEffectiveTravelerContext` | ✅ 守卫已就绪（Gate 全量挂接可续） |
| 4.3 Admin | traveler-context · sourceBreakdown · ETC diff | ✅ `demo-ks-phase4` |

---

### Phase 5 — Decision Knowledge

**不做第三套 Decision System。**

```text
DecisionEpisodeV1 + Outcome reconciliation
        ↓
DecisionCase Projector
        ↓
DecisionCase（持久化）
```

查询 V1（SQL 即可）：`country` · `decisionType` · `situationTags` · `riskType` · `outcome` · `regret`

| 任务 | 说明 | 状态 |
|------|------|------|
| 5.1 | 持久化超出热 Map（Knowledge 耐久注册表 + ingest/reproject） | ✅ |
| 5.2 | Projector：`projectEpisodeToKnowledgeCase` | ✅ |
| 5.3 | similarCases（country/decisionType/tags/riskType，无 embedding） | ✅ |
| 5.4 Admin | decision-cases · similar · ingest | ✅ |

**DEFER：** embedding 相似检索；Prisma 表（当前进程内耐久注册表，与 runtime 队列 DecisionCase 分离）。

---

### Phase 6 — Semantic / Health

- 保留 `/api/rag`；Knowledge Center 只做轻量 Documents / Retrieval Trace
- **永久禁止** Vector → HARD BLOCK（`assertVectorMustNotHardBlock`）
- Overview：**健康度指标**，不做「知识总量仪表盘」

| 指标 | 意义 | 状态 |
|------|------|------|
| Canonical Entity Coverage | ID 统一比例 | ✅ |
| Unresolved Entity Count | Fact 找不到实体 | ✅ |
| Snapshot SSOT Coverage | Gate 只读 Snapshot 比例 | ✅ |
| Stale Fact Rate | 过期动态事实 | ✅ |
| Relation Standardization Rate | 关系统一投影率 | ✅ |
| ETC Consume Coverage | 决策链统一上下文 | ✅ |
| DecisionCase Capture Rate | 决策沉淀率 | ✅ |
| Evidence Missing Rate | 缺证据比例 | ✅ |
| Vector Hard Block Banned | 语义永不 HARD BLOCK | ✅ |

Admin：`/documents` · `/retrieval-traces` · `/overview`

---

## 4. DEFER / 永久禁止

| 项 | 类别 |
|----|------|
| Neo4j / Arango / GraphRAG | DEFER |
| 8 Domain 全量 taxonomy | DEFER |
| 重写 travel-ontology contracts | 禁止 |
| Vector HARD BLOCK | **永久禁止** |
| 第三套平行 Memory / World / Decision 存储 | 禁止 |
| 知识总量仪表盘替代健康度 | 禁止 |

---

## 5. 与旧 Sprint 映射

| 旧 | 新 |
|----|-----|
| A1–A3 | Phase 0 + Phase 1 |
| A4–A6 | Phase 2 |
| B1–B6 | Phase 3 |
| C1–C2 | Phase 4 |
| C3–C5 | Phase 5 |
| D1–D3 | Phase 6 |

---

## 6. 当前状态

| Phase | 状态 |
|-------|------|
| Phase 0 Inventory | ✅ [knowledge-system-phase0-inventory.md](./knowledge-system-phase0-inventory.md) |
| Phase 1 Identity + Entities Admin | ✅ `src/knowledge-system/` |
| Phase 2 World State SSOT + Inspector | ✅ Snapshot 绑 worldFacts；stale 排除 HARD BLOCK；Admin diff |
| Phase 3 Relation Vocabulary + Adapters | ✅ V1 十二词；Golden Set / POI alt / Causal / Spatial 投影 + Admin |
| Phase 4 Traveler Context 收口 | ✅ ETC Inspector + SSOT guard + Admin；Gate 全量 ACTIVE 挂接可续 |
| Phase 5 Decision Knowledge | ✅ Episode→KnowledgeCase + similar + Admin（非 runtime 决策队列） |
| Phase 6 Semantic / Health | ✅ documents / retrieval-traces / overview + vector HARD BLOCK ban |
| Runtime Convergence（骨架钉主链） | ✅ prepareTick + ConstraintGateway ingress；Ontology 排除 stale road/weather HARD BLOCK；`KNOWLEDGE_RUNTIME_SSOT_ENFORCE` |
| Identity 扩覆盖 | ✅ `place:db` / `place:is:` → CPRE；Golden Set 28 链；Relation 端点 remap |
| DecisionCase Prisma | ✅ `knowledge_decision_cases` + upsert/load/SQL similar（表缺失时内存回退） |

### Env（运行时收敛）

| 变量 | 含义 |
|------|------|
| `KNOWLEDGE_RUNTIME_SSOT_ENFORCE=off\|shadow\|active` | off 默认；shadow 记审计；active 违规 throw |
| `EFFECTIVE_TRAVELER_CONTEXT_CONSUME=off\|shadow\|active` | ETC 消费；active 时 ingress 要求 ETC |

### Phase 1–6 + Runtime 代码落点

| 资产 | 路径 |
|------|------|
| Identity | `src/knowledge-system/identity/` |
| World State | `src/knowledge-system/world-state/` |
| Relations | `src/knowledge-system/relations/` |
| Traveler Context | `src/knowledge-system/traveler-context/` |
| Decision Knowledge | `src/knowledge-system/decision-knowledge/` |
| Semantic / Health | `src/knowledge-system/semantic/` |
| Runtime SSOT | `src/knowledge-system/runtime/`（挂 prepareTick / ConstraintGateway / Ontology） |
| Admin | `src/knowledge-system/admin/` |
| Module | `src/knowledge-system/knowledge-system.module.ts` |
