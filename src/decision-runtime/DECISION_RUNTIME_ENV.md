# Decision Runtime 环境变量矩阵

与 [ADR-006](./constraints/ADR-006-Unified-Decision-Runtime.md) 及 [ADR-007](./ADR-007-Decision-Runtime-v2.md) 配套。运行时能力汇总见 `resolveDecisionRuntimeCapabilities()`。

> **`DECISION_RUNTIME_MODE=LEGACY` ≠ `OPTIMIZATION_STRATEGY_MODE=LEGACY`（legacy-frozen 策略）。** 两维正交关系与成熟度评估见 [DECISION_RUNTIME_MATURITY.md](./DECISION_RUNTIME_MATURITY.md#31-两个正交维度runtime-链路-vs-选择策略)。

## 模式主开关

| 变量 | 值 | 效果 |
|------|-----|------|
| `DECISION_RUNTIME_MODE` | `LEGACY` | 默认：Legacy 候选生成为主，无 Canonical execute |
| | `SHADOW` | RFC-001 决策持久化但不改 Effective Plan（`RFC001_SHADOW_MODE=1` 等效语义） |
| | `CANARY` | 部分 Canonical execute（与 `CANONICAL` 同属 execute 启用族） |
| | `CANONICAL` | 正式 Canonical 运行时 |

兼容回退：`DECISION_GATEWAY_UNIFIED=1` 且未设 `DECISION_RUNTIME_MODE` 时，等价于 `CANONICAL`（或 `SHADOW` 若 `RFC001_SHADOW_MODE=1`）。

## 求解策略与实验（ADR-007）

| 变量 | 默认 | 说明 |
|------|------|------|
| `OPTIMIZATION_STRATEGY_MODE` | `AUTO` | `LEGACY` / `WEIGHTED` / `CPSAT_LEX` / `CPSAT_EPSILON`；生产 AUTO 暂选 legacy-frozen |
| `DECISION_LAB_ENABLED` | off | 启用 `decision-lab` benchmark（不写生产行程） |
| `OR_TOOLS_SOLVER_URL` | unset | Python OR-Tools sidecar base URL（如 `http://127.0.0.1:8091`）；未设则 `ortools-repair` 空跑 |
| `OR_TOOLS_REPAIR_SHADOW` | URL 已设则为 on | `1`/`0` — shadow 候选；**签核前禁止**作为 authoritative |
| `OR_TOOLS_SOLVER_TIMEOUT_MS` | `5000` | Nest → solver HTTP 超时 |

OR-Tools Shadow（`OrToolsRepairShadowService.compare` / `OrToolsRoadEvaluateShadowBridge`）产出报告恒含 `writeAttempted=false`、`gatewayRequired=true`；权威提案仍来自 Neptune / legacy。

Evaluate 主链：`RoadSegmentUnavailableEvaluateService` 在 Neptune 候选完成后挂接 `ortoolsShadow`（不并入 `repairCandidates`）。单日节点 `<2` 时记 `insufficient_day_nodes_for_routing`，不阻塞 Neptune。  
P2：prior shadow 相对 `worldStateSnapshotId` stale 时丢弃并强制重算（`staleDiscardTotal` / `evidenceFreshness`）。

```bash
# M2 MOVE_DAY multi-day shadow (default off). Set on Nest *and* Python sidecar.
OR_TOOLS_MOVE_DAY_SHADOW=1

# M3 Native CP-SAT SHIFT (default off). Set on Nest *and* Python sidecar.
OR_TOOLS_NATIVE_CPSAT=1

# M4 Release Authorization (default shadow — see M4_RA_01_SELECTED_TRIPS_PILOT.md)
# Prefer planning-signoff artifacts + structured Authority Token.
OR_TOOLS_AUTHORITATIVE_CANARY=0
OR_TOOLS_CANARY_STAGE=shadow
# selected_trips | 5% | 20% | 50% | 100%  — percent requires OR_TOOLS_CANARY_PERCENT_APPROVED=1
OR_TOOLS_CANARY_PERCENT_APPROVED=0
OR_TOOLS_AUTHORITY_ENVIRONMENT=staging
OR_TOOLS_AUTHORITY_TOKEN=
OR_TOOLS_AUTHORITY_TOKEN_SECRET=
OR_TOOLS_PRODUCT_SIGNOFF=0
OR_TOOLS_STABILITY_SIGNOFF=0
OR_TOOLS_LOCALITY_SIGNOFF=0
# legacy token equality (discouraged):
OR_TOOLS_AUTHORITY_SIGNOFF_REQUIRED=
OR_TOOLS_AUTHORITY_SIGNOFF=
OR_TOOLS_REAL_GOLD_MIN=5
```

Planning S4：`OPTIMIZE_ROUTE` / `AUTO_ARRANGE` 经 `OrToolsPlanningOrchestratorShadowBridge` 挂 `PlanProposal.ortoolsShadow`；`apply` 只写 `proposal.changes`。  
Lab 对照：`ortoolsShadow.labCompare`；汇总 `GET /decision-engine/v1/ortools-shadow/planning-lab/compare`。

| `OR_TOOLS_SHADOW_OBSERVABILITY_ENABLED` | on（除非 metrics disabled） | `GET /decision-engine/v1/ortools-shadow/*` |
| `OR_TOOLS_SHADOW_METRICS_DISABLED` | off | `1` 关闭 in-memory shadow 计数 |

## Decision Trigger Gateway（P1 治理收敛）

| 变量 | 默认 | 说明 |
|------|------|------|
| `DECISION_TRIGGER_GATEWAY_ENABLED` | off | 启用统一触发入口；`canonical-plan-selection` / Unified evaluate 经 Gateway dispatch |
| `DECISION_TRIGGER_LINEAGE_ENABLED` | on（Gateway 开时） | 记录 `DecisionRunRequest` lineage（内存，可观测） |

## 约束评估

| 变量 | 默认 | 说明 |
|------|------|------|
| `CONSTRAINT_EVALUATION_GATEWAY_ENABLED` | off | 兼容：`1` → `CONSTRAINT_GATEWAY_MODE=ON` |
| `CONSTRAINT_GATEWAY_MODE` | off | `OFF` \| `SHADOW_COMPARE` \| `ON` — 约束 Gateway  rollout |
| `AUTHORIZATION_POLICY_GATEWAY_ENABLED` | off | 统一 Decision / Tool / Commit 授权策略（默认仍走 legacy authorize） |
| `REPLANNING_TRIGGER_POLICY_ENABLED` | off | Trigger Gateway 附带 replanning 建议（不改变 dispatch authority） |

**Prometheus（SHADOW_COMPARE）**

| 指标 | 说明 |
|------|------|
| `tripnara_constraint_shadow_compared_total` | 双跑次数 |
| `tripnara_constraint_shadow_diverged_total{divergence_kind}` | 分歧次数（按 kind） |
| `GUIDE_CONSTRAINT_GATEWAY_ENABLED` | 跟随 Gateway | Guide 单草案 Gateway 评估（非 finalize） |

## 正式决策（不写 Effective Plan）

| 变量 | 默认 | 说明 |
|------|------|------|
| `CANONICAL_FULL_PLAN_SELECTION` | off | Legacy 全量候选 → Gateway → `DecisionCore.finalize` |
| `GUIDE_CANONICAL_PLAN_SELECTION` | 跟随 FULL | Guide 多变体 finalize（生成阶段） |

## 接受与 execute

| 变量 | 默认 | 说明 |
|------|------|------|
| `CANONICAL_EXECUTION_ENABLED` | 跟随 MODE | 显式关闭：`0` / `false` |
| `GUIDE_CANONICAL_ACCEPT_EXECUTE` | GUIDE finalize + execute | Guide accept → authorize → execute |
| `RFC001_SHADOW_MODE` | off | `1` 时 finalize 持久化但不创建 pending plan / 不 execute |
| `RFC001_ITINERARY_MATERIALIZE` | off | `1` 时 execute 将 PlanOperation 写入 ItineraryItem |
| `EFFECTIVE_PLAN_WRITE_GUARD` | off | `1` 时仅 execute/rollback 可 `setEffective` |

## Legacy / Guide 降级

| 变量 | 说明 |
|------|------|
| `GUIDE_DECISION_ENGINE_ENABLED` | Gateway 关闭时 Guide 降级 `TripDecisionEngine.generatePlan` |

## 推荐组合

### 本地全 Canonical（含 Guide）

```bash
DECISION_RUNTIME_MODE=CANONICAL
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
CANONICAL_FULL_PLAN_SELECTION=1
GUIDE_CANONICAL_PLAN_SELECTION=1
GUIDE_CANONICAL_ACCEPT_EXECUTE=1
RFC001_SHADOW_MODE=0
RFC001_ITINERARY_MATERIALIZE=1
EFFECTIVE_PLAN_WRITE_GUARD=1
```

### Shadow 观测（决策入库，不改行程）

```bash
DECISION_RUNTIME_MODE=SHADOW
RFC001_SHADOW_MODE=1
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
GUIDE_CANONICAL_PLAN_SELECTION=1
# GUIDE_CANONICAL_ACCEPT_EXECUTE 自动因 shadow/execute 关闭而不落地
```

### Legacy 仅 Gateway 评估

```bash
DECISION_RUNTIME_MODE=LEGACY
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
GUIDE_CONSTRAINT_GATEWAY_ENABLED=1
# 不设 CANONICAL_FULL_PLAN_SELECTION / GUIDE_CANONICAL_*
```

### Production Transition — 30d 观察窗（当前阶段）

```bash
# 模板：.env.production-transition.example
# 本地一键：npm run production-transition:dev-3000

DECISION_TRIGGER_GATEWAY_ENABLED=1
DECISION_TRIGGER_LINEAGE_ENABLED=1
CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
AUTHORIZATION_POLICY_GATEWAY_ENABLED=1
REPLANNING_TRIGGER_POLICY_ENABLED=1
LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=30
DECISION_RUNTIME_BASE_URL=http://localhost:3000/api
```

运维：`npm run trigger-wiring:status` · `npm run production-observation:report` · `npm run p5-weekly-ops`

## 诊断

```typescript
import { resolveDecisionRuntimeCapabilities } from './execution/decision-runtime-capabilities.util';
// resolveDecisionRuntimeCapabilities()
```

HTTP：`GET /api/decision-engine/v1/runtime-capabilities` — 含 `constraintShadowMetrics` snapshot（SHADOW_COMPARE 运行时累计）。

返回：`mode`, `constraintGateway`, `constraintGatewayMode`, `fullPlanSelection`, `guideCanonicalSelection`, `guideCanonicalAcceptExecute`, `canonicalExecute`, `effectivePlanWriteGuard`, `constraintShadowMetrics`。
