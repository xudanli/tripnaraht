# ADR-TRAVEL-MEMORY-RUNTIME — 旅行记忆运行时架构冻结

## Status

**Accepted**（2026-08-10）— **架构讨论停止。**  
**就绪标记（冻结）：** ✅ **Evidence Ingestion Ready** / ❌ **Decision Consumption Not Ready**  
→ Memory 在学习过去，**尚未**参与未来。详见 `src/travel-memory/TMR_READINESS.md`。  

**定位：** Decision Quality Improvement Layer；验收单位 = Memory-assisted Decision Episode。  
**北向问题：** 第 N 个真实 Trip 中，Memory 是否让 Nara 少犯了一次过去的错误？  

**真实链路（今日）：** Agent → **旧 Memory OS** → Decision/CGUS → Outcome → **TMR 写入** Episode/Candidate（热路径 + 可选 Prisma Durable）。  
**Phase 1 审计：** `GET /decision/:id/explanation` · `GET /memory/:id/evidence`（`travel_memory_*` 表）。  
**Phase 2+：** Context Assembly；选择性 CONSUME；CGUS soft + Contribution 证明；**Trip Shadow Pair + Outcome 回填**（CaseLog / North-star）。  
**未接线（完整消费）：** 冰岛真 Trip 运营批量验收、取代旧 Memory OS、CRE Memory Contract、Contract/Self-drive 真源汇聚。  

**边界：** Decision Contract = 当前约束；Self-drive = World/Operational；TMR = 过去证据。三者并列进 Context Assembly，**禁止**互吞。  

**Next：** 生产 migrate → 真 Trip 运营验收（Benefit/Harm < 红线）。  
**禁止：** 扩 Vector / Skill / Graph / 自治学习；把验证基建当成扩能力。

## Context

TripNARA 正在积累真实 Trip 决策证据（accept / override / outcome / regret）。  
若把记忆做成「聊天历史 + Vector DB」，会解决错误问题：

| 错误问题 | 正确问题 |
|----------|----------|
| 记住用户说过什么 | 未来某次旅行决策发生时，能否拿到**正确、仍有效、可追溯**的上下文 |
| Embedding 相似度召回 | 在什么情境下做了什么选择、结果如何 |

旅行决策记忆必须同时处理：多人、时间变化、行程状态变化、现实世界变化、决策结果变化。

已有可复用基座（**禁止平行重建 SoT**）：

| 能力 | 位置 |
|------|------|
| Agent Memory OS L0–L4 Views | `src/agent/memory/`（`AgentMemoryContext`） |
| Append-only TravelEvent Ledger | `src/agent/state-learning/travel-event-ledger.*` |
| Episode Assembler | `src/agent/state-learning/hardening/episode-assembler.util.ts` |
| Context Requirement Engine | `src/agent/context-requirement/`（决策缺什么事实） |
| CGUS Decision Trace Outcome Loop | `src/trips/decision/optimization/cgus-decision-trace.*` |
| Decision Ledger DAG（可失效） | `src/agent/memory/decision-ledger/` |

缺口不是再造一套 DB，而是：**统一运行时门面**，把上述零件编成 Ledger → Views → Policy 闭环，并由 Agent 按任务主动调用。

---

## Decision

### Travel Memory Principle（冻结）

```
Memory is not a storage of conversations.
Memory is a versioned evidence system that improves future decisions.

Travel Memory 不是保存用户历史，而是保存能够影响未来旅行决策的证据。
```

补充：

```
记忆的价值不在于存储了多少，而在于下一次面对相似决策时，
能否取回正确的事实、理解过去为什么这么决定，并据此做出更好的选择。

记住用户说过什么只是最低级的记忆；
记住用户在什么情境下做了什么选择、结果如何，才是真正的旅行决策记忆。
```

核心循环：

```
Observe → Decide → Act → Outcome → Remember → Reuse → Verify
```

**不是** `Conversation → Embedding → Vector DB → Recall`。

### 与 CGUS 的关系（冻结）

**不是**「CGUS 使用 Memory」。

```
          World Model
               |
        Decision Kernel
        ┌──────┴──────┐
        ↓             ↓
       CGUS       Travel Memory
        ↓             |
    Recommendation   |
        ↓             |
      Outcome ────────┘
               |
     下一轮 Decision Runtime 消费 Experience
```

- CGUS：**产生** Decision Evidence  
- Travel Memory：**沉淀** Decision Experience  
- Decision Runtime：**消费** Experience  

### 成功指标（冻结）

下一阶段指标**不是** Memory 命中率，而是：

```
Memory-assisted Decision → Acceptance↑ / Override↓ / Regret↓ / Repeated Mistake↓
```

与 CGUS 运营验证阶段一致：在真实 Trip 中证明是否减少 Decision Regret。

### Current State ≠ Memory

| 类型 | 示例 | 是否记忆 | 归属 |
|------|------|----------|------|
| 当前事实 State | 今天住 Vík、车辆 2WD、正在下雪 | 否 | World State / DB |
| 用户长期偏好 | 不喜欢每天换酒店 | 是 | Profile Memory |
| 当前 Trip 上下文 | 带父母、膝盖不好 | 是 | Trip Memory |
| 历史决策 | 选了南岸而非环岛 | 是 | Decision Ledger / Episode |
| 历史结果 | 接受建议后仍太累 | 是 | Outcome Memory |
| 成功处理经验 | 落地日晚到→降低首日负荷 | 是（程序记忆） | Procedural Memory（P0 冻结写入） |

「上一次是这样」**不得**被当成「现在还是这样」。

### Travel Memory Runtime 位置

```
                     ┌──────────────────────┐
                     │     Agent Runtime    │
                     │ Intent / Task / Goal │
                     └──────────┬───────────┘
                                │
                       Memory Need Planning
                                │
                 ┌──────────────▼──────────────┐
                 │     Travel Memory Runtime   │
                 │  Planner / Resolver / Policy│
                 │  Writer / Consolidator      │
                 └───────┬──────────┬──────────┘
                         │          │
              ┌──────────▼───┐  ┌──▼────────────┐
              │ Memory Views │  │ Memory Ledger │
              └──────────────┘  └───────────────┘
                         │
              Semantic Search（辅助层，非 SoT）
```

Vector Search 只是 retrieval capability，**不是** Memory Architecture 本身。

### 五层记忆（TMR L0–L5）

与现有 Agent Memory OS 编号不同；Runtime 内使用 **TMR** 前缀，并对现有层做映射。

| TMR 层 | 含义 | 生命周期 | 现有映射 |
|--------|------|----------|----------|
| L0 Working | 当前 turn / day / task / focus | 秒～分钟 | ALS / request context / TripTaskMemory 热切片 |
| L1 User Structured | User Memory Card（置信度 + evidence） | 年 | Agent L0 basics + L1 `UserTravelProfile` + MemoryStateV1 |
| L2 Trip | Trip override（不得污染长期画像） | Trip | routePartyProfile / trip digests / TripTaskMemory |
| L3 Episodic / Decision | Situation→Decision→Choice→Outcome→Regret | 长期 | TravelEpisodic + CGUS Trace + Decision Ledger |
| L4 Semantic | 自然语言证据（辅助召回） | 长期 | trips/memory Semantic / RAG（P0 不扩） |
| L5 Procedural | Learned Travel Procedure | 经 Promotion | Skill Registry 候选（P0 **只读冻结**） |

### Ledger — Views — Policy

1. **Ledger**：append-only `MemoryEvent`；禁止 UPDATE 旧记录；仅 ADD / CORRECT / INVALIDATE / SUPERSEDE / CONFIRM。  
   双时态：`validTime`（现实何时为真）+ `systemTime`（系统何时知道）。
2. **Views**：给 Agent 的是 Memory Context Package，不是 Ledger dump。
3. **Policy**：控制何时记、何时读、何时不信。  
   - P0 Explicit → SAVE confidence=1  
   - P1 Strong Inference → candidate  
   - P2 Weak Signal → 只留 Episode，不升偏好

### Context Authority Hierarchy（冻结）

```
Reality (World State)
  ↓
Hard Constraint
  ↓
Trip-specific Memory
  ↓
Explicit User Memory
  ↓
Learned User Memory
  ↓
Episode
  ↓
Semantic Recall
```

Action ≠ Preference；必须经过 Attribution 才可产生 Memory Candidate。

### Memory Scope（防污染）

`GLOBAL_USER | USER_COUNTRY | USER_TRIP_TYPE | TRIP | TRIP_MEMBER | TEAM | SESSION | DAY | DECISION`

### 与现有流水线的连接

```
User Input
  → Signals / Intent
  → Context Requirement Engine / Decision State   （缺什么事实）
  → Memory Need Planner                           （需要哪层记忆）
  → Travel Memory Runtime.resolve / build_context
  → World State + Memory Context Package
  → Context Resolver / Decision State
  → CGUS / Solver / Gate
  → Decision Trace
  → User Action → Outcome
  → Episode Assembler → Memory Candidate → Policy → Ledger
```

CRE 继续回答「决策缺什么事实」；Memory Need Planner 回答「需要哪类记忆视图」。二者互补，Planner **不**取代 ASK 权威。

### V1 Memory API（P0）

| API | 作用 |
|-----|------|
| `memory.get_profile` | L1 User Structured View |
| `memory.get_trip_memory` | L2 Trip View |
| `memory.get_relevant_decisions` | L3 相关 Episode |
| `memory.search_semantic` | L4（P0 stub / 委托现有） |
| `memory.write_candidate` | Policy 门控写入 Ledger |
| `memory.confirm` | 显式确认 → confidence↑ |
| `memory.invalidate` | INVALIDATE / SUPERSEDE |
| `memory.build_context` | 任务驱动 Memory Context Package |

### Procedural Memory 纪律

```
Episodes → Pattern Miner → Skill Candidate
  → Offline Evaluation → Shadow → Promotion Gate → Skill Registry
```

禁止在线自我修改 Skill。与 CGUS / Canary：**No evidence, no new behavior.**

---

## Consequences

### 正向

- 决策记忆与聊天记忆解耦；World State 不再被误当长期偏好。
- CGUS Outcome Loop 成为 Memory 主原料，而不是旁路日志。
- Agent 可主动 `recall`，而非每轮塞满 RAG。

### 约束 / 三项必须控制的风险

#### 风险 1：Episode → Preference 自动发生

禁止单次决策直接写画像。例：一次拒绝冰川 ≠「不喜欢冰川活动」（天气/价格/时间/同行/疲劳皆可能）。

控制：`DecisionAttributionConfidence`（status=`CANDIDATE`）+ `ATTRIBUTION_PROMOTION_GATE`  
（confidence≥0.72 ∧ episodes≥3 ∧ no contradiction ∧ 单证据权重≤0.35）才可进 Profile View。

#### 风险 2：buildContext 变成万能上下文

禁止 Every Agent Turn → `buildContext()` → 塞全部 Memory。

控制：`CRE → Task → Memory Need Planner → Memory Contract → buildContext(contract)`  
合同硬 deny：`ALL_USER_HISTORY` / `ALL_EPISODES` / `FULL_SEMANTIC_DUMP`。Memory 像 Tool：按任务申请。

#### 风险 3：Ledger 无持久化 → 无法审计追责

进程内热路径不足以支撑「为什么 Nara 认为我不喜欢早起？」。  
Durable Ledger 是 **Decision Accountability** 基础设施，不是性能优化。

---

## P0 已交付

| ID | 能力 | 状态 |
|----|------|------|
| P0-1 | User / Trip Structured Memory Views | ✅ |
| P0-2 | Append-only Memory Ledger（进程内） | ✅ 热路径 |
| P0-3 | Memory View + Contract-scoped Context Package | ✅ |
| P0-4 | Memory Need Planner → Memory Contract | ✅ |
| P0-5 | Decision Episode（CGUS Trace 桥） | ✅ |
| P0-6 | Outcome → Candidate（Attribution；非 Preference） | ✅ |
| P0-7 | Conflict / Scope / Confidence | ✅ |

### 明确暂缓

❌ Vector Memory　❌ 自动 Skill Learning　❌ Memory Graph　❌ 大规模平行 Agent Memory OS

---

## 下一阶段：Memory Validation Loop（V1 冻结）

**目标公式：** Baseline Decision Quality → Memory Assisted → Δ（Acceptance↑ Override↓ Regret↓ Repeated Mistake↓）

不是证明存储成功，而是证明 Outcome 改善。详见 `src/travel-memory/MEMORY_VALIDATION_LOOP.md`。

### Phase 1 — Prisma Ledger = Evidence Chain

重点不是迁移，而是：

```
Decision → Context Snapshot → Memory Used → Evidence Source
  → Decision Result → Outcome → Memory Update
```

`MemoryEvent` 必含：`evidenceRefs[]` / `lifecycleStatus` / `validTime` / `recordedTime` / `supersededBy`。  
无 `evidenceRefs` → `/why` 只能靠猜 → **不合规**。

### Phase 2 — Context Assembly Layer

禁止 `CRE → Memory Runtime` 特殊通路。正确：

```
Task Intent → Context Contract → Context Assembly
  ├── World Resolver（Weather / Road / …）
  ├── Booking Resolver
  ├── Team Resolver
  └── Memory Resolver（Profile / Trip / Episode / Evidence）
         ↓
   Decision Context
```

Memory 与 World/Booking/Team **同级** Context Provider。

### Phase 3 — Shadow Memory Evaluation（真 Trip，非大规模 A/B）

对齐 CGUS Shadow：同请求双轨（No Memory / With Memory）→ 对比用户选择与 Regret。  
扩展 **Memory Decision Trace**：`memoryContribution.used` — 证明 Memory 是否真正影响决策。

### Phase 4 — 三指标 + Promotion 红线

| 指标 | 作用 |
|------|------|
| Memory Benefit Rate | 参与决策中 Regret 下降比例 |
| Memory Harm Rate | **P0 红线**：>8% 禁止 Promotion |
| Memory Attribution Accuracy | 预测偏好 vs 真实约束/情境校准 |
| Memory Dependency Rate | 防过度依赖历史、忽视现实 |

### Memory Engineering Contract（冻结）

**MUST：** 证据、置信度、时间范围、作用范围、可解释  
**MUST NOT：** 覆盖 World State、自动改 Preference、绕过 Kernel、单次行为学习、作为唯一决策依据

---

## 验证期防漂移约束（冻结）

### MEMORY_LIFECYCLE

| 状态 | 含义 | 是否影响决策 |
|------|------|--------------|
| OBSERVED | 观察到信号 | 否 |
| CANDIDATE | 可能规律 | **否（Runtime 硬挡）** |
| QUALIFIED | 证据充分 | Shadow only |
| ACTIVE | 正式记忆 | **是** |
| SUPERSEDED / RETIRED | 替代 / 失效 | 否 |

**CANDIDATE 永远不能进入 Decision Context**（Profile View + `toDecisionSafeMemoryContext` 双层）。

### 原因 vs 结果（防假因果）

Attribution 必须产出 `causalFactors` + `userPreferenceSignal`。  
环境主导（如 WEATHER weight 高）→ `situationalDominant=true` → **禁止**学成用户偏好。

### Semantic Boundary

```
Semantic Memory is evidence retrieval, not preference inference.
语义记忆只能提供解释证据，不直接生成用户偏好。
```

禁止：`embedding similarity → pace = relaxed`。

### 最终架构（冻结）

```
                Decision Runtime
                      |
              Context Contract
       ┌──────────────┼──────────────┐
 World Resolver   Memory Resolver   External
       |              |
 World State     Travel Memory Runtime
                      |
        ┌─────────────┼─────────────┐
      Ledger        Views        Policy
        |
 Decision Evidence ← CGUS Outcome Loop
        |
 Episode → Attribution → Candidate Memory
```

### V1 运营规则（冻结）

```
Memory 不负责让 Nara 记住更多，而负责让 Nara 在相似决策中犯更少相同的错误。
```

验收只问：无 Memory 时 Decision Quality = X；有 Memory 后 = X+Δ。  
不问：存了多少 / Recall 命中 / Vector 相似度。

### Memory Quality Metrics

| 指标 | 含义 |
|------|------|
| Acceptance↑ Override↓ Regret↓ Repeated Mistake↓ | 决策质量 |
| **Memory Harm Rate** | 错误决策中 Memory 参与次数 / Memory 参与决策次数（防自信误导） |
| **Memory Dependency Rate** | Memory-assisted / Total decision（防忽视现实） |

价值闭环：

```
Same Situation → Past Experience → Better Decision → Lower Regret
```

---

## Implementation map

```
src/travel-memory/
  types/           lifecycle / contract / explainability
  ledger/          MemoryEvent + durable contract
  views/           Profile（ACTIVE only）
  policy/          write → CANDIDATE
  planner/         Need → Contract
  episode/         causal + attribution + promotion
  runtime/         buildContext + decisionSafe guard + explanation contract
```

---

## 成熟度快照

| 能力 | 状态 |
|------|------|
| Memory Architecture | ✅ 冻结 |
| Evidence-based Memory / Episode / Attribution / Contract | ✅ |
| Ledger Persistence（Evidence Chain） | 下一阶段 Phase 1 |
| Context Assembly | 下一阶段 Phase 2 |
| Real Trip Validation / Shadow | **核心任务** Phase 3–4 |
| Autonomous Learning | 暂停 |

**架构讨论停止。** 后续只问：第 N 个真实 Trip 中 Memory 是否让 Nara 少犯了一次过去的错误。  
变化只来自：真实 Trip → Trace → Outcome → Evaluation → 是否值得保留。
