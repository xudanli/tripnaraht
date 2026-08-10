# Travel Memory Runtime — 就绪状态（冻结）

> **Evidence Ingestion Ready；Decision Consumption = Selective Soft（可证明，非主路径替换）。**  
> Memory 可经 CGUS `scoringHints` 软影响推荐；**尚未**取代旧 Memory OS。

## 状态标记

| 标记 | 含义 |
|------|------|
| ✅ Evidence Ingestion Ready | 能从真实决策结果产生 Memory Evidence |
| ⚠️ Selective Soft Consume | `consume` → CGUS soft；偏好序翻 top1 时 `used=true` |
| ❌ Full Decision Consumption Not Ready | 尚未取代旧 Memory OS / CRE 主路径 |

二者阶段差异很大；验收与接线必须分开谈。

## 当前真实链路

```
用户请求 → Agent Runtime → Memory OS（旧路径）→ Decision / CGUS
  → Outcome → Travel Memory Runtime → Episode / Candidate Ledger

并行：
  prepareTick → TravelContextAssembler
    ├─ shadow：AssembledTravelContext（观测 only）
    └─ consume + gate：DecisionHints + Contribution Preview（并列，非替换）
```

**写入闭环 > 读取闭环。** 旧 Memory OS 仍是主路径。

## TMR 五层接入

| TMR 层 | 当前状态 | 是否影响 Agent |
|--------|----------|----------------|
| L0 Working | request context 已存在 | ✅ |
| L1 User Structured | Shadow/Consume 可投影 | ⚠️ 并列 hints，非主来源 |
| L2 Trip | Shadow/Consume 可投影 | ⚠️ 并列 hints，非主来源 |
| L3 Episodic | CGUS → Episode；可装载警告 | ⚠️ **主路径仍只写** |
| L4 Semantic | 冻结 | ❌ |
| L5 Procedural | 冻结 | ❌ |

## Context Assembly（Phase 2 Shadow + 选择性 CONSUME）

| 项 | 状态 |
|----|------|
| `assembleTravelContext` 分槽（Contract / Self-drive / Memory） | ✅ |
| `TravelContextAssemblerService` + `TRAVEL_CONTEXT_ASSEMBLY` | ✅ `off`（默认）/ `shadow` / `consume` |
| prepareTick 挂观测 `travel_context_assembly` | ✅ |
| 选择性 CONSUME 门控 + `travel_memory_consume` | ✅ Preview |
| Contribution Preview（门控后 `used=false`） | ✅ |
| CGUS soft：hints → `scoringHints`（非硬约束） | ✅ |
| Contribution 证明（偏好序翻 top1 → `used=true`） | ✅ |
| Trip Shadow Pair（Without vs With TMR） | ✅ OPTIMIZE 产出 |
| Outcome Loop 回填 Pair / CaseLog | ✅ `writeCgusDecisionOutcomeLoop` |
| Trip Shadow Bundle / North-star 汇总 | ✅ Outcome 后可答 |
| 响应观测 `memory_decision_trace` / `trip_shadow_pair` | ✅ |
| 取代 `MemoryContextAssemblerService` | ❌ 未做 |
| CRE ↔ Memory Contract 主路径 | ❌ 未做 |
| 冰岛真 Trip 批量运营验收 | ❌ 未做 |

实际主路径：

```
Decision Context = World + Booking + Team + Old Memory OS
```

目标（完整消费阶段）：

```
Decision Context = World Resolver + Booking + Team + Travel Memory Resolver
                 + Decision Contract（并列，非 Memory）
                 + Self-drive World（并列，非 Memory）
```

### 环境变量

| 变量 | 作用 |
|------|------|
| `TRAVEL_CONTEXT_ASSEMBLY=shadow` | 仅装配观测 |
| `TRAVEL_CONTEXT_ASSEMBLY=consume` | 装配 + 门控通过后注入并列 hints |
| `TRAVEL_CONTEXT_CONSUME_TASKS` | 可选任务 allowlist 正则（默认活动/路线/自驾） |
| `TRAVEL_MEMORY_CGUS_SOFT=active` | （默认）CGUS 用 memory scoringHints；可证明 `used` |
| `TRAVEL_MEMORY_CGUS_SOFT=shadow` | 只证明/观测，不改线上 scoringHints |
| `TRAVEL_MEMORY_CGUS_SOFT=off` | 禁用 soft |
| `TRAVEL_MEMORY_TRIP_SHADOW=off` | 关闭 Decision Pair 产出（默认开） |

### Staging 验证清单

1. **默认 off**：不设 env → 无 `travel_context_assembly` 层  
2. **Shadow**：`=shadow` → layer `travel_context_assembly_shadow`；响应含装配摘要；旧 OS snapshot 不变  
3. **Consume gate pass**：冰岛/活动类消息 + Ledger 有 ACTIVE pace → hints 进 DSO  
4. **CGUS soft active**：偏好序会翻 → `memoryContribution.used=true`  
5. **Trip Shadow Pair**：OPTIMIZE 后 `trip_shadow_pair.diverged`；无 Outcome 时 `northStarReady=false`  
6. **Outcome 回填**：Trip Review action/outcome → `tripShadowCaseLog` + `tripShadowNorthStar`  
7. **Harm 红线**：harmRate>8% → `promotionBlocked=true`  
8. **边界**：Contract / Self-drive / Memory 分槽；hints 不得进 hardConstraints  
9. **写入仍通**：CGUS Outcome → Episode / Candidate 不中断  
10. **下一验收**：冰岛真 Trip 多决策运营统计 |

## 边界（不得混淆）

| 类型 | 是什么 | 不是什么 |
|------|--------|----------|
| **Decision Contract** | 当前应遵守的约束 | 不是过去经验 |
| **Self-drive / Road / Vehicle** | World Knowledge / Operational Constraint | **不是** Travel Memory |
| **Travel Memory** | 过去发生过什么（证据） | 不是当前禁止令 |

错误：`过去不喜欢夜驾 → 当前禁止夜驾`  
正确：`过去夜驾体验差 → 建议依据 → Contract 决定是否约束`

## 已完成 / 未完成

**已完成：** 数据模型、Ledger/View/Policy、CGUS→Episode 写入、Attribution、Lifecycle、**Prisma Evidence Chain**、**Context Assembly**、**选择性 CONSUME**、**CGUS soft + Contribution 证明**、**Trip Shadow Pair + Outcome 回填**  

**未完成：** 冰岛真 Trip 运营批量验收、取代旧 Memory OS、CRE↔Memory Contract、Decision Contract 真源汇聚、Self-drive 完整 World Provider、生产库 migrate 落地确认  

## Accountability（Phase 1 已挂路由）

| 路由 | 作用 |
|------|------|
| `GET /decision/:id/explanation` | 为什么这个建议出现 |
| `GET /memory/:id/evidence` | 为什么认为有这个偏好 |

表：`travel_memory_events` / `travel_memory_evidence`（见 prisma migration `20260810_travel_memory_evidence_chain`）。  
DB 未 migrate 时：热路径 Ledger 仍工作，durable 静默跳过。

## 智能体接入三动作（未来）

1. Agent **不**直接 `memory.search` → 经 CRE → Context Contract → Assembly → Memory Provider  
2. `TravelContextAssembler` 取代主路径 `MemoryContextAssemblerService`  
3. ~~Decision Trace `memoryContribution.used`~~ → 真 Trip 上统计 Benefit/Harm

## 下一阶段优先级

1. ~~Prisma Ledger 合同~~ → **migrate 到目标库**  
2. ~~Assembly / CONSUME / CGUS / Trip Shadow Outcome 回填~~ → **真 Trip 运营验收**  
3. 冰岛真 Trip：北向问题可统计回答 + Harm Rate < 8%  

## 一句话

TMR 已具备 **采集 + 选择性消费 + Shadow Pair + Outcome 回填**；还差真 Trip 批量运营证据才能宣称稳定的 **决策增强**。
