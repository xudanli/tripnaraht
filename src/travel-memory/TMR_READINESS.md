# Travel Memory Runtime — 就绪状态（冻结）

> **Evidence Ingestion Ready；Decision Consumption = Selective Soft + ETC 可选 Active。**  
> 默认仍不取代旧 Memory OS；经开关可使 Injector / CGUS soft 统一读 **EffectiveTravelerContext**。

## 状态标记

| 标记 | 含义 |
|------|------|
| ✅ Evidence Ingestion Ready | 能从真实决策结果产生 Memory Evidence |
| ⚠️ Selective Soft Consume | `TRAVEL_CONTEXT_ASSEMBLY=consume` → CGUS soft；偏好序翻 top1 时 `used=true` |
| ⚠️ ETC Read Path Ready | `EFFECTIVE_TRAVELER_CONTEXT_CONSUME=shadow\|active`；硬面+软面可切换 |
| ⚠️ Traveler Memory Contract | 8×5 Object 写入 Ledger；Trip Override / 脏写门控已接线 |
| ❌ Full Decision Consumption Not Ready | 默认路径尚未全面取代旧 Memory OS / CRE |

## 当前真实链路

```
用户请求 → prepareTick
  → Memory OS Assembler（主硬装载 ALS）
  → TMR Context Assembly（off|shadow|consume）
  → resolveEffectiveTravelerContext（始终投影；obs 可见）
  → MVCC Freeze → Orchestration
       ↓
  DecisionParamsInjector
       ├─ 默认：旧 OS UserTravelProfile
       └─ ETC CONSUME=active：读 EffectiveTravelerContext
       ↓
  CGUS soft hints
       ├─ 默认/TMR consume：TMR DecisionHints
       └─ ETC CONSUME=active：ETC advisory 投影
       ↓
  Outcome → TMR Episode / Candidate
  Standing/Learning 脏写 →（WRITE_GATE）Traveler Memory Contract
```

**写入闭环已就绪；读取闭环可开关启用。** 旧 Memory OS 默认仍是主硬路径。

## TMR 五层接入

| TMR 层 | 当前状态 | 是否影响 Agent |
|--------|----------|----------------|
| L0 Working | request context 已存在 | ✅ |
| L1 User Structured | View + Traveler Memory Contract | ⚠️ ETC/ soft 可投影；默认非主来源 |
| L2 Trip | Trip Override（`scope=TRIP`） | ⚠️ ETC L2_WINS；产品「这次不一样」 |
| L3 Episodic | CGUS → Episode；可装载警告 | ⚠️ **主路径仍偏写** |
| L4 Semantic | 冻结 | ❌ |
| L5 Procedural | 冻结 | ❌ |

## V1 边界冻结（ETC 四纪律）

M1–M6 = Traveler Memory V1 正式实施边界。详见 ADR「ETC 四纪律」。

| # | 冻结点 | 一句话 |
|---|--------|--------|
| 1 | ETC 纯投影 | 只 read→merge→priority→emit；不写 Memory / 不晋升 / 不改 L1·L2 |
| 2 | 冲突优先级 | Explicit Trip Constraint > L2 > L1 Hard > L1 Pref/Habit > Learned > Default |
| 3 | 决策向投影 | 8×5 是 Contract；下游消费 ETC 决策字段，禁止散落重解释 Ontology |
| 4 | active ≠ 全生效 | 每条带 authority/confidence/provenance/sourceScope；Semantic 定消费面 |

**旧 Memory OS：** 过渡期上游兼容输入，**不是**永久下游契约。  
**下一阶段：** 真 Trip 验证 ETC 是否改变推荐/决策；**不**扩 Memory 类型。

## EffectiveTravelerContext（M1–M3）

| 项 | 状态 |
|----|------|
| `resolveEffectiveTravelerContext` | ✅ prepareTick 始终投影（read-only） |
| obs `effective_traveler_context` | ✅ |
| `EFFECTIVE_TRAVELER_CONTEXT_CONSUME=off` | ✅ 默认；Injector/soft 不改 |
| `=shadow` | ✅ 硬面+软面只 diff / 对照 |
| `=active` | ✅ Injector 读 ETC；soft hints 来自 ETC（≠ 全记忆硬生效） |
| 禁止 hints → hardConstraints | ✅ |
| 禁止 ETC 写侧副作用 | ✅ 纪律冻结（Resolver 无写入口） |
| 条目 `authority` + 硬/软分流 | ✅ Semantic→authority；HABIT=CONTEXT 不进决策面 |

## Traveler Memory Contract + Trip Override（M4–M5）

| 项 | 状态 |
|----|------|
| `TravelerMemoryObjectV1`（Domain×Semantic） | ✅ |
| `writeTravelerMemory` / `listTravelerMemories` | ✅ |
| legacy predicate 只读映射 | ✅ |
| `POST .../inherit-habit` · `.../trip-different` | ✅ |
| L2 硬守卫（禁止 GLOBAL_USER） | ✅ `l1Untouched` |
| Habit Summary 卡 | ✅ `GET .../habit-summary` |

## 脏写收口（M6）

| 项 | 状态 |
|----|------|
| `TRAVELER_MEMORY_WRITE_GATE=off\|shadow\|active` | ✅ |
| Standing Preference → Contract | ✅ active 跳过 user_summary upsert |
| PreferenceLearning → BEHAVIORAL | ✅ active 跳过 learnedProfile upsert |
| DNA → Candidate；跳过 memory_state_v1 longTerm | ✅ active（decision_dna 仍写兼容） |

## Context Assembly（既有）

| 项 | 状态 |
|----|------|
| `assembleTravelContext` 分槽 | ✅ |
| `TRAVEL_CONTEXT_ASSEMBLY` | ✅ `off`（默认）/ `shadow` / `consume` |
| CGUS soft + Contribution 证明 | ✅ |
| Trip Shadow Pair + Outcome 回填 | ✅ |
| 取代 `MemoryContextAssemblerService` | ❌ 未做（ETC 为过渡唯读出口） |
| 冰岛真 Trip 批量运营验收 | ❌ 未做 |

### 环境变量

| 变量 | 作用 |
|------|------|
| `TRAVEL_CONTEXT_ASSEMBLY=shadow\|consume` | TMR 装配 / 选择性 CONSUME |
| `TRAVEL_CONTEXT_CONSUME_TASKS` | consume 任务 allowlist |
| `TRAVEL_MEMORY_CGUS_SOFT=active\|shadow\|off` | CGUS soft 是否改线上 scoringHints |
| `TRAVEL_MEMORY_TRIP_SHADOW=off` | 关闭 Decision Pair（默认开） |
| `EFFECTIVE_TRAVELER_CONTEXT_CONSUME=off\|shadow\|active` | ETC 硬面+软面消费 |
| `TRAVELER_MEMORY_WRITE_GATE=off\|shadow\|active` | 脏写是否收口到 Contract |

### Staging 验证清单

1. **默认**：不设 ETC/WRITE_GATE → 行为与旧路径一致；仍有 `effective_traveler_context_shadow` obs  
2. **ETC shadow**：`EFFECTIVE_TRAVELER_CONTEXT_CONSUME=shadow` → Injector audit `changedKeys`；soft 仍 TMR  
3. **ETC active**：同输入 L2 pace override → DecisionParams / soft hints 随 ETC  
4. **Trip Different**：`POST /traveler-memory/trips/:id/trip-different` → `scope=TRIP`；L1 list 不变  
5. **Habit Inherit**：清 override；mode=`HABIT_INHERIT`；`l1Untouched`  
6. **WRITE_GATE active**：Standing「记住…」不写 user_summary；Ledger 有 traveler.*  
7. **边界**：hints 不得进 hardConstraints；Contract ≠ Decision Contract ≠ Self-drive  
8. **下一验收**：冰岛真 Trip 多决策 Benefit/Harm  

## 边界（不得混淆）

| 类型 | 是什么 | 不是什么 |
|------|--------|----------|
| **Decision Contract** | 当前应遵守的约束 | 不是过去经验 |
| **Self-drive / Road / Vehicle** | World Knowledge / Operational | **不是** Travel Memory |
| **Travel Memory / ETC** | 过去证据 + 长期/本次旅行者模型 | 不是当前禁止令 |
| **L1 Persistent** | 我通常怎么旅行 | 不是「这次带父母」 |
| **L2 Trip Override** | 这一次有什么不同 | 不得写回 L1 |

## HTTP（Traveler Memory）

| 路由 | 作用 |
|------|------|
| `GET /traveler-memory/travelers/:userId/habit-summary` | Nara 对我的了解 |
| `POST /traveler-memory/travelers/:userId/registration-seed` | 注册轻量种子（EXPLICIT L1） |
| `POST /traveler-memory/trips/:tripId/inherit-habit` | 按我的习惯 |
| `POST /traveler-memory/trips/:tripId/trip-different` | 这次不一样 |
| `GET /traveler-memory/trips/:tripId/overrides` | 列出 L2 |
| `DELETE /traveler-memory/trips/:tripId/overrides` | 清除 L2 |
| `GET /decision/:id/explanation` | 为什么这个建议 |
| `GET /memory/:id/evidence` | 为什么有这个偏好 |

## 一句话

TMR + Traveler Memory V1 已具备 **采集 + Contract + ETC 可选读闭环 + Trip Override + 脏写门控**；ETC 四纪律已冻结。默认生产仍安全偏旧 OS，差真 Trip 运营证据才能宣称稳定的 **决策增强默认开启**。下一阶段验证 ETC 效果，**不**扩 Memory 类型。
