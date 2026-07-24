# ADR-006: Unified Decision Runtime — Legacy 降级与 Canonical 决策权威

## Status

Accepted (2026-07-01)

## Context

TripNARA 同时存在 Legacy `TripDecisionEngine`、Guardian RFC-001、Decision Kernel、Decision OS、Guide-to-plan 等多条可形成「最终方案」的路径。约束语义分散在 `ConstraintChecker`、Guardian assertion、Destination Pack、Trip Constraints API 四层，且 `isFeasible(): boolean` 无法表达 `UNKNOWN` / `REQUIRES_VERIFICATION`。

空世界状态（如 `roadStates: []`）被 Legacy 路径解释为「无道路问题」而非「未获得数据」，叠加 fail-open 降级，对安全硬约束不可接受。

## Decision

### 1. 组件角色（正式口径）

| 组件 | 目标角色 |
|------|----------|
| `TripDecisionEngine` | 规划**候选**生成与修复候选；**不再**独立形成正式决策 |
| `ConstraintChecker` | Legacy 约束评估**适配器**，输出统一 `ConstraintAssertion` |
| Guardian (Abu / Dr.Dre) | 风险、负荷等领域**策略评估器** |
| Neptune | **候选修复生成器**（`DecisionCandidate[]`） |
| Destination Pack | 目的地事实与规则**提供方** |
| Trip Constraints API | 用户显式约束 **SSOT**（`ConstraintFact`） |
| `ConstraintEvaluationGateway` | 统一约束评估**入口** |
| `DecisionCore.finalize()` | 唯一候选淘汰、排序与**决策形成**入口 |
| `authorize` / `execute` | 唯一修改 **Effective Plan** 的链路 |
| Decision Kernel / Decision OS | **experimental**；仅作为 Decision Core 可选计算能力，禁止业务直连 |

### 2. 约束语义

统一评估状态：

```typescript
type ConstraintEvaluationStatus =
  | 'PASS'
  | 'BLOCK'
  | 'WARNING'
  | 'UNKNOWN'
  | 'REQUIRES_VERIFICATION';
```

**没有数据 ≠ 没有问题。** 空 `roadStates` / `hazardZones` / `ferryStates` 且无 `LOADED` 标记 → `completeness = MISSING` → 安全相关 scope 产出 `UNKNOWN` 或 `REQUIRES_VERIFICATION`。

### 3. Fail 策略

| 约束类别 | 数据失败策略 |
|----------|--------------|
| 安全硬约束（道路关闭、红色预警、禁行、禁区） | fail-closed → `REQUIRES_VERIFICATION` 或 `BLOCK` |
| 法规、许可、道路开放 | fail-closed |
| 预约、闭馆等运营约束 | 无法确认 → `REQUIRES_VERIFICATION` |
| 预算、节奏、偏好 | fail-open，但必须记录 `degraded` |

Legacy `isFeasible(): boolean` 保留为 **兼容包装器**，新代码必须消费 `CanonicalConstraintReport`。

### 4. P0 交付（本 ADR 配套实现）

- `src/decision-runtime/constraints/` — contracts + `ConstraintEvaluationGateway`
- Providers：`LegacyConstraintCheckerAdapter`、`RealityCompletenessProvider`、`DestinationPackConstraintProvider`（Guardian / User 为后续 PR）
- `failure-policy.service` — 按约束类别定义 fail-closed / fail-open
- 单测：`roadStates: []` 且无 LOADED → `overallStatus !== FEASIBLE`

### 5. P1 交付（本 ADR 配套实现 — 2026-07-01）

- `LegacyTripPlanningAdapter` — MultiPlanGenerator 候选生成（`retainAllCandidates` 关闭 Legacy 预过滤）
- `FullPlanSelectionService` — 候选 → Gateway → `DecisionCore.finalize`
- `POST /api/decision-engine/v1/canonical-plan-selection`（需 `CANONICAL_FULL_PLAN_SELECTION=1`）
- `UserConstraintProvider` — Trip Constraints API → `ConstraintFact`（骨架）
- Shadow 对比：`plan-selection-shadow.util.ts`

### 6. P1 后续（2026-07-01 增量）

- `EffectivePlanWriteGuardService` + `EFFECTIVE_PLAN_WRITE_GUARD=1` 封禁非 execute/rollback 的 `setEffective`
- `UserConstraintProvider.evaluate()` — HARD 预算等 → `ConstraintAssertion`
- Guide-to-plan：`GUIDE_CONSTRAINT_GATEWAY_ENABLED=1`（默认跟随 `CONSTRAINT_EVALUATION_GATEWAY_ENABLED`）走 Gateway，不再默认 `generatePlan`
- `resolveDecisionRuntimeCapabilities()` — 统一读取 runtime 能力矩阵
- **Guide canonical 全链路（2026-07-01）**
  - 生成：`GUIDE_CANONICAL_PLAN_SELECTION=1` → 多变体 Gateway → `DecisionCore.finalize`（预览，不写 Effective Plan）
  - 接受：`GUIDE_CANONICAL_ACCEPT_EXECUTE=1` → shell → finalize 持久化 → `authorize` → `execute`
  - `TripPlan` → `ADD_ITEM` PlanOperation → `Rfc001ItineraryMaterializerService`
  - 决策摘要：`understandingSummary.canonicalDecision` + Trip `metadata.guideCanonicalDecisionId`

### 7. P1 后续（尚未完成）

1. ~~全量行程候选经 `DecisionCore.finalize()` 选优~~（Legacy API + Guide 已接入）
2. ~~Guide Effective Plan 旁路~~（accept 已走 execute；legacy materialize 仍作降级）
3. `DECISION_RUNTIME_MODE=LEGACY|SHADOW|CANARY|CANONICAL` 替代多个布尔开关（helper 已有，缺运维矩阵文档）
4. 更广义的 architecture lint（除 `setEffective` 外的 plan 写入旁路）

## Consequences

- 新增 Slice / 国家包前必须先经 Gateway 归一化断言
- Legacy 引擎可保留功能，但返回值语义从「最终决定」变为「候选」
- Shadow 对比：`Legacy boolean` vs `Gateway report` 差异可量化
- Decision Kernel / OS 需标记 `experimental`，CI 禁止新业务模块 import

## References

- `src/decision-runtime/constraints/constraint-evaluation.gateway.service.ts`
- `src/trips/guardian-decision-core/services/decision-core.service.ts`
- `src/trips/guardian-decision-core/contracts/guardian-outputs.types.ts`
- `src/trips/decision-semantics/UNIFIED_DECISION_FRONTEND_INTEGRATION.md`
- **ADR-007** — `src/decision-runtime/ADR-007-Decision-Runtime-v2.md`（Optimization 合同、Strategy、Decision Lab）
- `src/decision-runtime/contracts/` — canonical contracts SSOT
