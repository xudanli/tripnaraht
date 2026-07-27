# TripNARA 能力边界（冻结）

**状态：** FROZEN — Authority Consistency Slice  
**日期：** 2026-07-28  

## 统一表述

> TripNARA = **显式旅行本体** + **动态世界状态** + **规则型因果预测** + **多目标求解** + **可验证写回**

在 Authority Consistency 基础完成前，**禁止**对外/对内宣称：

- 隐式结构挖掘（从历史结果自动发现未注册规律）
- 学习型世界模型（学习型状态转移）
- 「完整」隐式 Causal World Model 已实现

允许表述：显式规则与固定公式的时序因果预测、Decision Scope 裁剪、OR-Tools **Shadow** 候选、Preview→Confirm→Apply→PlanVersion 权威写回。

## 权威写链（唯一）

```text
DecisionProblem → Gateway → Verification → Preview → Confirm → Apply/Execute → PlanVersion
```

- Legacy **不得**拥有独立直接写 Plan / Effective Plan 入口。
- OR-Tools 默认 Shadow，不得直写 Plan。
- NARA Look 不新增 Apply。
- `OntologyCanonicalApply` 仅为封印包装：内部 `executeMutation` 必须委托上述权威写链，禁止 `setEffective` / 直写 ItineraryItem。

## DecisionScope / Snapshot（Authority Consistency）

| 落点 | 行为 |
|------|------|
| `DecisionScope` + `TravelWorldStateSnapshot` | 同 Run 共享 `snapshotId`；候选 ⊆ `mutableObjects` ∩ `allowedActions` |
| Gateway `evaluatePlan` / `evaluateCandidate` | 可选 `decisionScope`；越权 → `DECISION_SCOPE_VIOLATION` |
| `ConstraintEngine` + `weather-outdoor-storm` | `resolveDecisionScopeForGateway` 从 signals 自动建 scope |
| Weather L2 evaluate | 写 `trip.metadata.authorityDecisionScopeSignals`；`buildTripWorldStateFromPrismaTrip` 灌回 signals |
| DecisionCore finalize | 越权 repair → `POLICY` / `DECISION_SCOPE_VIOLATION` |
| PostValidator | 求解后 fail-closed 复检 scope |

## Ontology P1 持续变化 Slice

| Slice | Build 状态 |
|-------|------------|
| `p1-weather-deterioration` | **IN_BUILD**（强风 / 天气恶化最小集） |
| `p1-road-closure` | **DEPRECATED** — 不进 production build |
| `p1-activity-disruption` | **DEPRECATED** — 不进 production build |

## Kill switches（实际存在）

| Env | 用途 |
|-----|------|
| `ONTOLOGY_AUTHORITY_KILL_SWITCH` | Ontology 权威写总开关（engaged → 禁止 mint Effective Revision） |
| `ONTOLOGY_AUTHORITY_SEMANTIC_KILL_SWITCH` | 语义级关闭（逗号分隔 scope，如 `WEATHER_DETERIORATION`） |
| `ONTOLOGY_P1_WEATHER_DETERIORATION_KILL_SWITCH` | 天气 Slice |
| `ONTOLOGY_P2_*_KILL_SWITCH` | P2 Shadow / advisory |
| `UWC_*_KILL_SWITCH` | UWC canary 走廊 |

`ONTOLOGY_AUTHORITY_KILL_SWITCH` 为 Canonical Apply 封印路径正式 kill；勿与不存在的别名混淆。

## 相关

- [travel-causal-decision/PHASE_GATE.md](../../src/travel-causal-decision/PHASE_GATE.md)
- [travel-ontology-p2-temporal-prediction-charter.md](./travel-ontology-p2-temporal-prediction-charter.md)
- [strong-wind vertical slice](../../src/harness/evals/vertical-slice/README.md)
