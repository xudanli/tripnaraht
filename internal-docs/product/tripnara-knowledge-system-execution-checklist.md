# TripNARA Knowledge System — 仓库核查结论与执行清单

> **排期已迁移：** 请以 [tripnara-knowledge-system-execution-plan-v2.md](./tripnara-knowledge-system-execution-plan-v2.md)（Phase 0–6 · 双线）为准。  
> **Phase 0 盘点：** [knowledge-system-phase0-inventory.md](./knowledge-system-phase0-inventory.md)  
> **后台：** [knowledge-control-center-admin-api.md](./knowledge-control-center-admin-api.md)  
> 本文保留为 2026-08-13 仓库审计底稿（A–F 判断）；Sprint A–D **不再作为执行顺序**。

**文档版本：** 1.1.0（superseded scheduling）  
**状态：** 审计底稿  
**生效日期：** 2026-08-13  
**上位：** [tripnara-knowledge-system-v1.md](./tripnara-knowledge-system-v1.md) · [travel-ontology-v05-maturity.md](./travel-ontology-v05-maturity.md)

**成熟度标尺：** L0 不存在 · L1 零散 · L2 结构化契约 · L3 已进运行时 · L4 统一语义 · L5 可持续积累/学习

---

## A. Current State（当前真实知识体系）

### 成熟度总表

| Layer | Level | Evidence（路径） | Main Gap |
|-------|------:|------------------|----------|
| **Ontology** | **L3** | `src/travel-ontology/contracts/`（Entity + TravelWorldFact + ConstraintAssessment）；强风 vertical slice 进 Gate | 无 Domain Registry / IS_A；Place/Hotel/Flight 非一等契约实体 |
| **Knowledge Graph** | **L2** | Golden Set `CO_VISIT`/`SOFT_ALTERNATIVE`（`iceland-region-planning-packs`）；POI alternatives；Spatial `fromPoiId→toPoiId`；风险 `causal-chains` Admin；query-rewriting 仅为别名词表；`graph-db.interface` **未上库** | 无统一 Relation Vocabulary；非决策图谱 |
| **Rules** | **L3** | Destination Pack + Constraint Gateway + Ontology provider + F-road physical；IS ≫ CN | Gateway 默认模式/全场景未闭合；启发式分散 |
| **Semantic Knowledge** | **L2** | pgvector Place/RAG；`/api/rag`；`data/rag/*` seed | 语料薄；**正确红线**：不得 HARD BLOCK |
| **World State** | **L3** | `TravelWorldFact` + `CanonicalWorldStateSnapshot`；road/weather freshness | **SSOT 双轨**：WorldModelContext ↔ Snapshot ↔ TravelContext |
| **Traveler Context** | **L3** | Traveler Memory + ETC + Trip Override + travel-context | ETC 未全量硬消费；Memory OS 旁路仍在 |
| **Decision Knowledge** | **L2** | `DecisionEpisodeV1`、Outcome reconciliation、DecisionProblem、trace | 多为单次/同 trip；**无跨行程可检索 DecisionCase 库** |

### 一句话画像

> 已有「决策可跑的知识闭环」（Ontology Core + Rules + WorldFact/Snapshot + Traveler Memory），  
> **尚未**形成「统一 Identity + Relation + 可积累 Decision Knowledge」的 Knowledge System。

### 稳定 / 半静态 / 动态 / 个人（分类核查）

| 类型 | 现状 | 是否混淆 |
|------|------|----------|
| Stable（LOCATED_IN、道路类型、CO_VISIT） | Pack / Golden Set / spatial | 与动态状态未严格分表，但运行时大体可分 |
| Semi-static（开放季、法规） | Pack regulations / daylight | 部分写进规则 JSON |
| Dynamic World State | Fact + Snapshot + providers | **与 Legacy WorldModelContext 双轨** |
| Personal / Trip | Memory + ETC + Override | 结构清；消费不统一 |

---

## B. Gap Map

### P0 — 必须做（决策正确性 / 引用一致性）

| ID | Gap | Why now |
|----|-----|---------|
| **KS-P0-1** | Canonical Entity Identity 未跨系统统一 | Place=`is.*`（CPRE）；Vehicle/Segment/Activity/WorldFact.subjectId 各用一套字符串 |
| **KS-P0-2** | World State SSOT 双轨 | Snapshot vs WorldModelContext vs TravelContext 并存 → Gate 输入可不一致 |
| **KS-P0-3** | WorldFact.subjectId 未绑定 Identity | 无法保证「同一现实对象」在 Fact / Trip / Pack 同指 |

### P1 — 高价值（统一语言，小步）

| ID | Gap | Why |
|----|-----|-----|
| **KS-P1-1** | Relation Vocabulary 散落 | Golden Set / POI alt / causal-chains 命名不统一 |
| **KS-P1-2** | Predicate / EntityType metadata 缺 | 规则无法按类型继承绑定 |
| **KS-P1-3** | ETC 未成为 Evaluate/Gate 唯一读路径 | 同一世界、不同人结果不稳定 |

### P2 — 资产化

| ID | Gap | Why |
|----|-----|-----|
| **KS-P2-1** | DecisionEpisode → 可检索 DecisionCase | 现在热 Map / 单 trip，非长期决策资产 |
| **KS-P2-2** | Rule Binding 显式引用 entity/relation/fact | Pack 规则仍偏字符串/本地 ID |
| **KS-P2-3** | Semantic 语料扩容（官方+FAQ） | 仅解释层；Gate 不变 |

### DEFER — 无证据不建

| Item | 原因 |
|------|------|
| 完整 8 Domain 深 taxonomy | 决策链未要求 |
| Neo4j / 独立 KG 服务 / GraphRAG | 查询模式未证明需要；先统一 Vocab |
| 推翻重写 travel-ontology contracts | 已进运行时（L3） |
| Vector 进 HARD BLOCK | **永久禁止** |
| 第三套平行 Memory/World/Decision 存储 | 违反角色红线 |

---

## C. Target Architecture（不推翻现有）

```text
① Travel Ontology          （Schema / Entity / Identity metadata）
② Knowledge Graph          （Relation Vocabulary — 可先表/JSON，非必须图 DB）
③ Rules & Constraints      （Condition → Effect → Severity）
④ Semantic Knowledge       （RAG：解释/证据发现 ONLY）
                ↓
⑤ Dynamic World State      （TravelWorldFact + Snapshot SSOT）
⑥ Traveler & Trip Context  （→ EffectiveTravelerContext 唯一读）
                ↓
         Decision Runtime
Observe → Diagnose → Generate → Evaluate → Gate → Recommend → Execute
                ↓
⑦ Decision Knowledge       （DecisionCase = Situation→…→Outcome）
```

详见 [tripnara-knowledge-system-v1.md](./tripnara-knowledge-system-v1.md)。

---

## D. Data Contracts（最小 TypeScript — 仅契约，不实现）

落点建议：`src/travel-ontology/contracts/knowledge-system.types.ts`（新建时）。

```typescript
/** KS — 最小契约草案（执行时再落文件） */

export type KnowledgeDomain =
  | 'TRAVELER' | 'GEOGRAPHY' | 'PLACE' | 'MOBILITY'
  | 'ACTIVITY' | 'TIME' | 'ENVIRONMENT' | 'TRIP';

export type CanonicalEntityId = string; // e.g. "is.reynisfjara" | "segment:is:f208"

export interface EntityIdentity {
  canonicalEntityId: CanonicalEntityId;
  entityType: string;          // "RouteSegment" | "Place" | ...
  domain: KnowledgeDomain;
  aliases?: string[];
}

export interface KnowledgeEntity extends EntityIdentity {
  displayName?: string;
  status?: 'ACTIVE' | 'DEPRECATED';
}

export type RelationType =
  | 'INSTANCE_OF' | 'SUBCLASS_OF'
  | 'LOCATED_IN' | 'NEAR' | 'CONNECTED_TO' | 'ON_ROUTE'
  | 'CO_VISIT' | 'ALTERNATIVE_TO' | 'REQUIRES'
  | 'INCOMPATIBLE_WITH' | 'SUITABLE_FOR'
  | 'AFFECTS' | 'INCREASES_RISK_OF' | 'CAUSES' | 'MITIGATES';

export interface KnowledgeRelation {
  relationId: string;
  type: RelationType;
  from: CanonicalEntityId;
  to: CanonicalEntityId;
  confidence: number;
  source: string;
  validFrom?: string;
  validTo?: string;
  /** 决策边：SUBSTITUTE_WHEN 等条件载荷 */
  condition?: Record<string, unknown>;
}

/** 已有：复用 TravelWorldFact，勿平行再建 */
// import type { TravelWorldFact } from './travel-world-fact.types';

export type RuleSeverity = 'HARD_BLOCK' | 'BLOCK' | 'WARNING' | 'ADVISORY' | 'HEURISTIC';

export interface Rule {
  ruleId: string;
  kind: 'physical' | 'legal' | 'safety' | 'temporal' | 'dependency' | 'heuristic';
  condition: Record<string, unknown>;
  scope?: { domain?: KnowledgeDomain; entityTypes?: string[] };
  effect: string;
  severity: RuleSeverity;
  evidenceRequirement?: 'REQUIRED' | 'OPTIONAL';
}

export interface EvidenceRef {
  evidenceId: string;
  provider: string;
  observedAt?: string;
  uri?: string;
}

export interface DecisionCase {
  caseId: string;
  situationSnapshotId: string;
  userGoal?: string;
  constraintIds: string[];
  evidence: EvidenceRef[];
  options: Array<{ optionId: string; summary: string }>;
  evaluation?: Record<string, unknown>;
  recommendedOptionId?: string;
  userChoice?: { action: 'ACCEPT' | 'OVERRIDE' | 'REJECT_ALL' | 'NO_ACTION'; selected?: string };
  appliedAction?: string;
  outcome?: Record<string, unknown>;
  regret?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  confidence?: number;
}
```

**已有勿重复：** `TravelWorldFact`、`ConstraintAssessment`、`DecisionEpisodeV1`、`EffectiveTravelerContextV1` — DecisionCase 应由 Episode **投影/升格**，不是第三套。

---

## E. Migration Strategy

| 现有资产 | 策略 |
|----------|------|
| `travel-ontology/contracts/*` | **保留**；仅加 Identity/Domain metadata 字段或旁路 registry |
| CPRE `is.*` | **保留为 Place Identity 真源**；扩面 + 文档统一 ID 格式（勿再发明 `place:is:` 第三种，除非写清 alias 映射） |
| Destination Pack rules | **保留**；P2 起 ruleId → entity/relation 绑定 |
| Golden Set CO_VISIT / SOFT_ALTERNATIVE | **增加 adapter** → 标准 RelationType 命名 |
| `causal-chains` Admin | **统一命名** 到 `AFFECTS` / `INCREASES_RISK_OF` 等 |
| SpatialGraph segments | **保留**；映射为 `CONNECTED_TO` / `ON_ROUTE` |
| `graph-db.interface` / Neo4j | **不要动 / DEFER** |
| Query-rewriting「KG」词表 | **保留为 ER 层**；勿称为 Travel KG |
| WorldModelContext | **adapter → Snapshot**；新决策路径禁止直读为 SSOT |
| Traveler Memory + ETC | **保留**；关掉旁路直读（渐进 ACTIVE） |
| DecisionEpisode | **升格** 持久化 + 检索 → DecisionCase |
| RAG / Vector | **保留**；永不进 HARD BLOCK |
| 完整 taxonomy / Neo4j / GraphRAG | **延迟迁移 / 不做** |

---

## F. 最终判断（只答三问）

### 1. TripNARA 当前是否已经有 Knowledge System？

**有「决策向知识能力」，尚无「统一 Knowledge System」。**  
七层里 ①③⑤⑥ 达 L3；②④⑦ 停在 L1–L2。产品上可称 **Decision Ontology Core + Runtime Facts/Rules**，不可称完整 Knowledge System / Travel KG。

### 2. 当前最大的知识体系瓶颈是什么？

**Identity + World SSOT 双轨**（不是「实体种类不够」或「缺 Neo4j」）。  
同一现实对象在 CPRE / WorldFact / Pack / Trip 上可分裂；Gate 输入可来自多套世界状态。

### 3. 下一步最值得做的 1–3 件事？

1. **Canonical Entity Identity 收敛**（Place 强制 CPRE；WorldFact.subjectId 规范；Segment/Vehicle 命名空间约定）  
2. **World State 单一 Snapshot SSOT**（新路径禁 WorldModelContext 旁路；过期 Fact re-eval）  
3. **Relation Vocabulary 最小集 + Golden Set/因果链命名对齐**（不做图库）

---

## 执行清单（可开 Issue）

### Sprint A — Identity & SSOT（P0）

- [ ] **A1** 冻结 ID 规范文档：Place 继续 `is.slug`；定义 `segment:` / `vehicle:` / `activity:` / `hazard:` 前缀；禁止并行发明第三套  
- [ ] **A2** WorldFact 写入路径校验：Place 类 subjectId 必须通过 CPRE / canonical 校验（IS 先）  
- [ ] **A3** 列清单：当前 `subjectId` 实例如 `veh_1`/`seg_f208`/`wx_*` → 映射表  
- [ ] **A4** Decision Runtime 新 evaluate 路径：**只读** `CanonicalWorldStateSnapshot`（含 `worldFacts`）  
- [ ] **A5** 标记 `WorldModelContext` 为 legacy；新增代码 lint/注释禁直读为 SSOT  
- [ ] **A6** 过期 Fact（road/weather TTL）→ 强制不参与 BLOCK 或触发 re-eval（接现有 freshness util）

**验收：** ONT-ID-01（同 POI 多别名 → 同 ID）；同一 trip 两次 Gate 读同一 snapshotId。

### Sprint B — Vocabulary & Relations（P1）

- [ ] **B1** 落 `knowledge-system.types.ts`（EntityIdentity / KnowledgeRelation / Rule / DecisionCase 最小集）  
- [ ] **B2** Relation 词表常量：先锁 12–16 个（含 `CO_VISIT` `ALTERNATIVE_TO` `REQUIRES` `AFFECTS` `INCREASES_RISK_OF`）  
- [ ] **B3** Adapter：Iceland Golden Set → `KnowledgeRelation[]`（只读投影，不改 Pack 文件结构）  
- [ ] **B4** Adapter：POI alternatives → `ALTERNATIVE_TO` / `SOFT_ALTERNATIVE`  
- [ ] **B5** Adapter：execution-risk causal-chains → 因果 RelationType（或 predicate 对齐文档）  
- [ ] **B6** EntityType + Domain metadata 表（手写 registry JSON，覆盖现有 core-entities）

**验收：** 强风链可用标准谓词表达；CO_VISIT 可被统一类型查出（哪怕内存投影）。

### Sprint C — Context & Decision Assets（P1–P2）

- [ ] **C1** ETC consume mode：选中场景 `ACTIVE`，Gate/Evaluate 禁止旁路 Memory OS 硬字段  
- [ ] **C2** Trip Override 进入 Constraint 评估输入（至少 pace / capability / vehicle）  
- [ ] **C3** DecisionEpisode 持久化策略（DB 或 durable ledger）超出进程热 Map  
- [ ] **C4** `DecisionCase` 投影器：Episode + Outcome reconciliation → Case  
- [ ] **C5** 最小检索：按 country + situation tags 召回 similarCases（可先 SQL/JSON）

**验收：** 同 World State、不同 ETC → 不同 WARNING/REPLACE；至少 1 条跨 session 可查 Case。

### Sprint D — Semantic & Admin（P2，低优先级）

- [ ] **D1** RAG 灌官方 Road.is / SafeTravel / FAQ（IS）；标记 `VERIFIED`  
- [x] **D2** Admin 文档声明：RAG 接口 ≠ Gate；监控禁止向量命中写 BLOCK  
- [x] **D3** （可选）风险知识库 Admin 展示标准因果谓词名 — Phase 3 Relations vocabulary 已覆盖

### 明确不做（本阶段）

- [ ] ~~Neo4j / Arango 上线~~  
- [ ] ~~GraphRAG~~  
- [ ] ~~8 Domain 全量内容灌库~~  
- [ ] ~~重写 Ontology contracts~~  
- [ ] ~~Vector HARD BLOCK~~

---

## 角色任务完成度（对照 知识体系.md §九）

| 交付物 | 状态 |
|--------|------|
| A Current State | ✅ 本文 §A |
| B Gap Map | ✅ 本文 §B |
| C Target Architecture | ✅ 本文 §C + knowledge-system-v1 |
| D Data Contracts | ✅ 本文 §D（草案，未落代码文件） |
| E Migration Strategy | ✅ 本文 §E |
| F 三问判断 | ✅ 本文 §F |
| 仓库核查 | ✅ 2026-08-13 对照 contracts / CPRE / packs / gateway / memory / episode / rag |

**未做（有意）：** 大规模实现、引入图数据库、完整 taxonomy。
