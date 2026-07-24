# TravelCausalDecision — P0 统一因果决策契约

**状态：** **P0 Functional Complete** → Pilot Validation（见 `PHASE_GATE.md`）  
**Schema：** `tripnara.travel_causal_decision@v1`

## 目的

跨后端 / Copilot / Web / Mobile 的**唯一产品读模型**。冻结后再接线 Decision Runtime，避免继续堆并行抽象。

## 主链（正式叙事）

```text
Travel Ontology
  → Travel World State
  → Causal World Model
  → Decision Runtime
  → Solver / What-if
  → Verification Gateway
  → Plan Version / Execution Action
  → Decision Ledger
  → Outcome Reconciliation
```

## 三个闭环对应类型

| 闭环 | 类型 | 文件 |
|------|------|------|
| 时序因果预测 | `TemporalImpact` | `types/temporal-impact.types.ts` |
| 预测结果对账 | `DecisionOutcome` | `types/decision-outcome.types.ts` |
| 规则生命周期 | `TravelCausalRule` | `types/travel-causal-rule.types.ts` |
| 统一出口 | `TravelCausalDecision` | `types/travel-causal-decision.types.ts` |

`DecisionOutcome.reconciliation` 与现有 `DecisionOutcomeValidation.verdict` 通过 `mappers/map-outcome-validation-verdict.util.ts` 互转。命名刻意区分 ECO / workspace / cutover 的 reconciliation。

## 三标准案例（必须跑通全链）

| caseId | 故事 |
|--------|------|
| `case.strong-wind-appointment` | 强风 → 降速 → 延误 → 错过签到 |
| `case.road-closure-overnight` | 封路 → 绕行 → 超限 → 晚到 → 次日受影响 |
| `case.member-fatigue` | 睡眠不足+徒步+驾驶 → 疲劳 → 风险 ↑ → 完成率 ↓ |

每条验收步骤见 `CAUSAL_CASE_LOOP_STEPS`（facts → … → outcomeReconciliation）。

## 前端

只渲染 `projectCausalDecisionCard(decision)`，不展示原始因果图。

## Live 投影（强风案例）

Canonical Causal Trace 在冰岛强风 seed 时自动挂载：

```ts
const trace = await causalTrace.ensureProblemTrace({ ... });
// bindSelected → EXECUTE bindExecuted（outcome 仍 PENDING）
// VERIFY → bindCalibrated({ actualOutcome from DecisionOutcomeValidation })
// apply 响应含 outcomeReconciliation.status
```

`UnifiedDecisionResolutionService` 在 revalidation PASSED 时调用
`extractActualOutcomeFromDecisionValidation` → `bindCalibrated`，推进
`TravelCausalDecision.outcome.reconciliation`。

Apply 响应字段：`outcomeReconciliation.status`（PENDING → CONFIRMED / PARTIAL / DISPROVED / …）。

## 非目标（仍开放）

- 导航轨迹级 GPS 回放（当前支持 geofence / offline `gps_*` 定点）
- 规则 DB 审核台（Pack JSON + in-memory registry 已可版本化）

## Pack 规则迁移

`listTravelCausalRules({ destinationPack: 'IS' })` 合并：

- 手写标准案例规则（`is.wind.*` …）
- Destination Pack：`pack:IS_ROAD_CLOSED_BLOCK` 等（`data/destination-packs/is/rules/*.json`）

## 观测直写

GPS geofence / 签到 / 到达点击 → `ActualOutcomeSnapshot` → `applyObservationToCausalTrace`。

`DecisionOutcomeValidationService.validateDecision` 在采集观测后自动推送对账。
