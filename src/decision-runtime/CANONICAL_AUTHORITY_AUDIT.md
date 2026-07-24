# Canonical Authority Audit

> **Sprint 目标**：在不大改架构的前提下，验证六条入口链路是否经过同一套约束权威、版本权威、决策记录与写入保护。  
> **填完本表前**：不扩展新编排模式。  
> **关联**：`CONSTRAINT_SEMANTIC_CONSOLIDATION.md` · `DECISION_RUNTIME_MATURITY.md` · `AGENT_UNIFIED_INTERFACE_SCOPE.md` · Staging env：`.env.canonical-authority-staging.example`

---

## 1. 权威组件 SSOT

| 组件 | 代码 SSOT | 默认开关 | 职责 |
|------|-----------|----------|------|
| **ConstraintEvaluationGateway** | `decision-runtime/constraints/constraint-evaluation.gateway.service.ts` | `CONSTRAINT_GATEWAY_MODE=OFF` | 唯一正式约束评估内核 |
| **ConstraintEngine 桥接** | `trips/decision/constraints/constraint-engine.service.ts` | 随 Gateway mode | SM VERIFY 路径调用 `isFeasible` |
| **Decision Ledger (Memory)** | `agent/memory/decision-ledger/*` | Kernel prepare 装载 | 编排期因果图、失效/STALE |
| **RFC001 Decision Ledger** | `trips/guardian-decision-core/persistence/rfc001-decision-ledger.store.ts` | `CANONICAL_EXECUTION_ENABLED` | 正式 Decision ID + 闭环 |
| **Trip Version (DSO)** | `trip-orchestration-lock.util.ts` · `plan-version.store.ts` | 锁默认 ON | `client_dso_version` 双检 |
| **Effective Plan Write Guard** | `decision-runtime/execution/effective-plan-write-guard.service.ts` | `EFFECTIVE_PLAN_WRITE_GUARD` 默认 OFF | `setEffective` 仅 execute/rollback |
| **Trip Write Lock** | `trip-orchestration-lock.service.ts` | `TRIP_ORCHESTRATION_LOCK_ENABLED` 默认 ON | 写编排串行化（TTL ≈ max_seconds+15s，最长 180s） |

**运行时能力快照**：`resolveDecisionRuntimeCapabilities()`（`decision-runtime/execution/decision-runtime-capabilities.util.ts`）

---

## 2. 六条入口链路审计

每条链路须回答七个问题：

1. 有没有进入 **ConstraintEvaluationGateway**？
2. 有没有使用同一份 **Trip Snapshot**（Memory OS 冻结快照）？
3. 有没有生成 **Decision ID**？
4. 有没有写入 **Decision Ledger**？
5. 有没有执行 **Trip Version** 校验？
6. 有没有经过 **Effective Plan Write Guard**？
7. 有没有记录最终采用/拒绝方案？

### 2.1 QUICK_ANSWER（`RouteClass=QUICK_ANSWER` · `taskType=DATA_LOOKUP|GENERIC_QA|RAG_QA`）

| 检查项 | 结论 | 证据 |
|--------|------|------|
| 编排深度 | ✅ 轻量，不走 CLAUDE_SM 全链 | `ClaudeOrchestrator` DATA_LOOKUP 短路 · `routeAndRunWithClaudeStateMachine` 对 DATA_LOOKUP 跳过 PLAN_GEN |
| 写锁 | ✅ **不抢锁** | `TRIP_READ_TASK_TYPES` 含 DATA_LOOKUP → `shouldAcquireTripOrchestrationLock` 返回 false |
| Constraint Gateway | ⚠️ **可选/旁路** | 快答通常不调 `ConstraintEngine.isFeasible`；道路关闭等硬约束**不会**自动 BLOCK |
| Decision Ledger | ⚠️ **可选** | Kernel 仍装载 ledger，但快答路径通常无新 decision node |
| Trip Version | N/A 读路径 | 无 `client_dso_version` 时不校验 |
| Write Guard | ✅ 不写行程 | 快答不调用 `setEffective` |
| 深编排误入 | ⚠️ **风险点** | 若 `routePolicy` 误判为 TRIP_PLANNING 或熔断降级到 LEGACY System2，可能升格 |

**结论**：读路径合理；**须保证不误入写编排 + 不误写 DSO**。

### 2.2 FULL_DEEP_PLAN（`RouteClass=FULL_DEEP_PLAN` · `OrchestrationMode=CLAUDE_SM`）

| 检查项 | 结论 | 证据 |
|--------|------|------|
| Memory Snapshot | ✅  
| Constraint Gateway | ⚠️ **条件性** | 仅当 `CONSTRAINT_GATEWAY_MODE≠OFF`；`ON_FOR_SELECTED` 仅部分 scenario 为权威 |
| Decision Ledger | ✅ Memory ledger + 可选 RFC001 | Kernel prepare · `gate-eval-phase` · decision_log |
| Decision ID | ⚠️ **条件性** | RFC001 finalize 需 `CANONICAL_EXECUTION_ENABLED` |
| Trip Version | ✅ 写路径 | 写锁 pre/post_lock `STALE_PLAN_VERSION` |
| Write Guard | ⚠️ **条件性** | 需 `EFFECTIVE_PLAN_WRITE_GUARD=1` |
| 三人格 Gate | ✅ | `runGateEvalPhase` → `decisionKernel.executeGateEval` |

**结论**：**最接近 Canonical**；权威完整度取决于 env flags。

### 2.3 PARTIAL_REPLAN（`RouteClass=PARTIAL_REPLAN` · 常走 CLAUDE_SM 或 CLAUDE_DYNAMIC）

| 检查项 | 结论 | 证据 |
|--------|------|------|
| Constraint Gateway | ❓ **待验证** | DYNAMIC 路径 Skills 可能绕过 `ConstraintEngine`；SM 路径与 FULL_DEEP_PLAN 同 VERIFY |
| Decision Ledger | ⚠️ 部分 | ITINERARY_ADJUST 有 repair command + ledger refs；DYNAMIC 不完整 |
| Trip Version | ✅ 写锁 | 同 FULL_DEEP_PLAN |
| Write Guard | ❓ | DYNAMIC 自动落库路径需单独审计 |
| 与 FULL_DEEP_PLAN 同权威 | ❌ **未保证** | 同一约束可能 SM 走 Gateway、DYNAMIC 走 legacy feasibility |

**结论**：**待验证 — 高风险不一致区**。

### 2.4 FAST PATH（Agentic Tool Loop · Active Trip Analysis · Team Discussion）

| 检查项 | 结论 | 证据 |
|--------|------|------|
| Agentic Tool Loop | ⚠️ | `tryExecuteAgenticToolLoopFastPath`：跳过 CLAUDE_SM；基础设施类 MCP 工具 |
| Active Trip Analysis | ✅ 只读 | `tryBuildActiveTripAnalysisFastPath` 直接返回分析 |
| 写行程 | ⚠️ **风险** | Agentic 路径无 Decision ID / Write Guard 强制链；依赖 tool 副作用 |
| Constraint Gateway | ❌ 通常 bypass | Fast path 不进入 VERIFY 子图 |
| Trip Version | ❌ 通常 bypass | 非 TRIP_WRITE task 时不抢锁 |
| 安全/version 检查 | ❌ **缺口** | Harness AU-P0-002 覆盖 |

**结论**：**高风险旁路** — 读 OK，任何 mutating tool 须收口。

### 2.5 LEGACY FALLBACK（熔断 `CLAUDE_SM → CLAUDE_DYNAMIC → LEGACY`）

| 检查项 | 结论 | 证据 |
|--------|------|------|
| Constraint Gateway | ❌ **旁路** | `routeAndRunLegacy` → Router + System1/System2 + ReAct/DAG；**不**调 ConstraintEvaluationGateway |
| Decision Ledger | ❌ 弱 | 仅 `state.react.decision_log`，非 Decision Semantics ledger |
| Decision ID | ❌ | 无 RFC001 finalize |
| Trip Version | ⚠️ 仅入口锁 | 持锁期间无 commit 点 version 重检 |
| Write Guard | ❌ 默认 bypass | Guard 默认 OFF；LEGACY 可直接 mutate state |
| 硬约束 | ❌ **高风险** | 道路关闭等须靠旧 Gate/Readiness，**无 Canonical Gate 等价** |

**结论**：**高风险 — 不得作为安全降级路径**；熔断时应 BLOCK/NEED_CONFIRMATION，而非 silent write。

### 2.6 ASYNC WORKER（`route_and_run/async` · Worker Lease resume）

| 检查项 | 结论 | 证据 |
|--------|------|------|
| 主链 | ✅ 同 sync | `RouteAndRunAsyncService.executeInBackground` → `agentService.routeAndRun` |
| Resume | ⚠️ | `resumeStaleTask` 用 `request_snapshot` + `durable_trip_run_id` 续跑 |
| Trip Version 重检 | ❌ **缺口** | Resume 时**未**强制 refresh trip snapshot / evidence freshness |
| Evidence 过期 | ❌ **缺口** | 无 `Evidence snapshot expired` 终端检测 |
| 与用户并发 | ⚠️ | 依赖入口写锁；async 若 classification 为读 task 可能无锁 |

**结论**：**待验证 — Resume 须补 freshness + version gate**。

---

## 3. Authority Matrix（运行时）

| RouteClass | OrchestrationMode | Constraint Gateway | Decision Ledger | Trip Version | Write Guard | 结论 |
|------------|-------------------|--------------------|-----------------|--------------|-------------|------|
| QUICK_ANSWER | CLAUDE_DYNAMIC (light) | N/A | 可选 | N/A | N/A | ✅ 读路径合理 |
| QUICK_ANSWER | LEGACY (误路由) | ❌ | ❌ | ⚠️ | ❌ | 🔴 须防误入 |
| FULL_DEEP_PLAN | CLAUDE_SM | ✅* | ✅ | ✅ | ✅* | ✅ Canonical（*flags） |
| PARTIAL_REPLAN | CLAUDE_SM | ✅* | ✅ | ✅ | ✅* | ⚠️ 与 DYNAMIC 不一致 |
| PARTIAL_REPLAN | CLAUDE_DYNAMIC | ❓ | ❓ | ✅ | ❓ | 🔴 待验证 |
| FAST PATH | Agentic / Analysis | ❌ | ❌ | ❌ | ❌ | 🔴 写操作须收口 |
| FULL_DEEP_PLAN | LEGACY (fallback) | ❌ | ❌ | ⚠️ | ❌ | 🔴 高风险 |
| ASYNC | Worker (resume) | 同 sync | 同 sync | ✅ 双检 | 同 sync | ⚠️ 读路径 OK；写路径 commit 闸门已接 |

**Canonical 回答（当前）**：**否** — Legacy、Fast Path、部分 DYNAMIC/Async Resume 可绕过 Canonical Gate。

---

## 4. 旁路清单（须收口）

| # | 旁路 | 严重度 | 建议 |
|---|------|--------|------|
| 1 | LEGACY fallback 无 Constraint Gateway | P0 | 熔断 → NEED_CONFIRMATION/BLOCK，禁止 silent write |
| 2 | Agentic Fast Path mutating tools | P0 | Trip 修改必须走 Decision ID → Eval → Version → Write Guard |
| 3 | Async resume 无 freshness/version 重检 | P0 | Commit 前 `expectedTripVersion` + evidence TTL |
| 4 | CONSTRAINT_GATEWAY_MODE 默认 OFF | P1 | 生产 Canary → ON_FOR_SELECTED → ON |
| 5 | EFFECTIVE_PLAN_WRITE_GUARD 默认 OFF | P1 | 生产启用 + architecture lint CI |
| 6 | Trip 写锁覆盖整个编排（≤180s） | P1 | 读快照 → 释放锁 → 规划 → 短事务 commit |
| 7 | PARTIAL_REPLAN DYNAMIC vs SM 双轨 | P1 | 统一 VERIFY 入口 |

---

## 5. Trace 字段（Work Package A）

建议在 `observability.trace.authority_audit_v1` 记录：

```typescript
interface AuthorityAuditTraceV1 {
  schemaId: 'tripnara.authority_audit@v1';
  route_class: string;
  orchestration_mode_resolved: string;
  constraint_gateway: { entered: boolean; mode: string; authority: boolean };
  memory_snapshot_id: string;
  decision_id?: string;
  decision_ledger_written: boolean;
  trip_version_check?: { stage: 'pre_lock' | 'post_lock' | 'commit'; passed: boolean };
  write_guard: { enabled: boolean; authority?: 'execute' | 'rollback' };
  fast_path?: string;
  fallback_used?: boolean;
  conclusion: 'CANONICAL' | 'PARTIAL' | 'BYPASS' | 'READ_ONLY';
}
```

**状态**：✅ 已实现 — Gateway finalize + Legacy/Async/Agentic adapter 层合并；入口 `authority_gateway_v1` 区分 READ_ONLY / PARTIAL / BYPASS。

---

## 6. Harness 测试索引

| ID | 标题 | Phase | Spec | 状态 |
|----|------|-------|------|------|
| AU-P0-001 | Legacy 不得绕过硬约束 | P0 | `au-p0-001-legacy-hard-constraint.spec.ts` | 🟢 GREEN（`CanonicalMutationCommitGuard` + Legacy adapter） |
| AU-P0-002 | Fast Path 不得直接写行程 | P0 | `au-p0-002-fast-path-no-write.spec.ts` | 🟢 GREEN（`ToolSideEffect` + dispatch/commit 双闸门） |
| AU-P0-003 | 异步恢复必须重新校验 | P0 | `au-p0-003-async-resume-freshness.spec.ts` | 🟢 GREEN（`DurableAuthoritySnapshotV1` + resume/commit 双检） |
| AU-P1-004 | 重复请求不重复写入 | P1 | `au-p1-004-idempotency.spec.ts` | 🟢 |
| AU-P1-005 | Replay 不重新调用 LLM | P1 | `au-p1-005-replay-no-llm.spec.ts` | 🟢 GREEN（strict seal policy + LLM guard） |
| AU-P1-006 | 并发修改版本冲突 | P1 | `au-p1-006-version-conflict.spec.ts` | 🟢 GREEN（async commit `EXECUTION_CONFLICT`） |
| AU-P1-007 | 三编排模式安全结论一致 | P1 | `au-p1-007-orchestration-mode-safety-parity.spec.ts` · `au-p1-007-orchestration-mode-safety-parity-l2.spec.ts` | 🟢 GREEN（契约 + RFC001 L2） |
| AU-P1-008 | Decision Ledger 完整闭环 | P1 | `au-p1-008-ledger-closure.spec.ts` | 🟢 GREEN（RFC001 Iceland harness） |

运行：`npm run harness:authority`

### 6.1 CanonicalMutationCommitGuard（已实现）

- SSOT：`decision-runtime/execution/canonical-mutation-commit-guard.util.ts`
- Envelope：`mutation-authority-envelope-v1.types.ts`
- Legacy 接入：`legacy-mutation-commit.adapter.ts` → `AgentService.routeAndRunLegacy`
- Flag：`LEGACY_MUTATION_WRITE_GUARD=ENFORCE`（默认）；`EFFECTIVE_PLAN_WRITE_GUARD=OFF|SHADOW|ENFORCE`

### 6.2 Async Resume Authority（已实现）

- SSOT：`decision-runtime/execution/async-resume-authority.util.ts`
- 快照：`DurableAuthoritySnapshotV1` 在 `RouteAndRunAsyncTaskStore.createInitialized` 冻结
- Resume 检查：`RouteAndRunAsyncService.resumeStaleTask` → `validateAsyncAuthority(stage=resume)`
- Commit 检查：`executeInBackground` 完成编排后 → `applyAsyncMutationCommitGuard(stage=commit)`
- Flag：`ASYNC_MUTATION_WRITE_GUARD=ENFORCE`（默认）

### 6.3 Agentic Fast Path Mutation Gate（已实现）

- SSOT：`decision-runtime/execution/agentic-tool-side-effect.util.ts`
- Dispatch 闸门：`mcp-agent-executor.service.ts` → `evaluateAgenticToolMutationGate`
- Response 闸门：`agentic-route-and-run-mutation.adapter.ts`
- Flag：`AGENTIC_MUTATION_WRITE_GUARD=ENFORCE`（默认）
- 规则：`NONE`/`READ_EXTERNAL` 放行；`TRIP_MUTATION`/`UNKNOWN`/`EXTERNAL_ACTION` 缺 envelope 拒绝

### 6.4 Execution Gateway Authority Audit（已实现）

- SSOT：`decision-runtime/execution/execution-gateway-authority-audit.util.ts`
- 入口：`ExecutionGatewayService.runRouteAndRun` → `buildGatewayAuthorityEntryContext`
- 出口：`applyGatewayAuthorityAuditToResponse` → 合并 Legacy/Async/Agentic adapter 已有 `authority_audit_v1`
- 观测：`observability.authority_gateway_v1.conclusion` = `READ_ONLY` | `PARTIAL` | `BYPASS` | `CANONICAL`

### 6.5 Replay Strict Seal LLM Guard（已实现）

- SSOT：`agent/runtime/replay-strict-seal.util.ts`
- Gateway：`ExecutionGatewayService.runRouteAndRun` → `runWithReplayStrictSealContext`
- LLM 闸门：`LlmService.callLlm` / `callChatWithTools` → `assertFreshLlmCallAllowedUnderReplayStrictSeal`
- 已有编排侧：`orchestration_replay_strict_seal` 跳过 routeContext enricher、DOS/intent compile、mode fallback

---

## 7. 状态契约 V2（Work Package C）

四轴状态类型：`agent/contracts/route-and-run-status-v2.types.ts`  
兼容投影：`projectLegacyResultStatus()` — 旧 `result.status` 暂保留。

---

## 8. 三人格结构化契约（Work Package D）

类型 SSOT：`agent/contracts/guardian-evaluation-v1.types.ts`  
规则：LLM 仅表达；正式判断必须结构化；Ledger 记结构化结果；narration 为投影。

---

## 9. 三门语义（Work Package D — 目标流程）

```
INTAKE → PRECONDITION_GATE → RESEARCH → PLAN → PLAN_EVALUATION → VERIFY ⇄ REPAIR → DECISION_FINALIZE → EXPLANATION_PROJECT → RESPONSE_ASSEMBLY
```

| Gate | 当前代码 | 目标 |
|------|----------|------|
| PRECONDITION_GATE | 分散在 entry responses + governance | 输入/权限/trip 可修改性 |
| PLAN_EVALUATION | 混在 GATE_EVAL | Abu/Dre/Neptune + 候选比较 |
| VERIFY | VERIFY 子图 + ConstraintEngine | 确定性事实 + version + freshness |

---

## 10. Trip 写锁指标（Work Package — 测量先行）

| 指标 | 说明 |
|------|------|
| `trip_lock_wait_ms` | 抢锁等待 |
| `trip_lock_hold_ms` | 持锁时长 |
| `trip_lock_scope` | trip_id |
| `trip_lock_reason` | taskType / route_class |
| `trip_lock_conflict_count` | TRIP_ORCHESTRATION_BUSY |

实现：`agent/utils/trip-orchestration-lock.observability.util.ts`（trace + 可选 Prometheus 后续接入）

---

## 11. 完成标准

> 任意一个可能改变行程的请求，无论来自同步、异步、Fast Path、Claude 状态机、动态编排还是 Legacy，是否都必须经过同一个约束权威、版本权威、决策记录和写入保护？

**当前答案：否** — egress 写闸门已默认 ENFORCE；ingress Constraint Gateway 仍条件性（`CONSTRAINT_GATEWAY_MODE` 默认 OFF）。

**Harness 状态（Authority Sprint）**：8/8 GREEN · `npm run harness:authority`（58 tests）

**收口顺序（剩余）**：生产 Flag Ramp（§13）→ Gateway BYPASS 率下降 → `CONSTRAINT_GATEWAY_MODE=ON` → Canonical = Yes。

---

## 12. 本 Sprint 明确不做

见用户规划 §八：不接入 CP-SAT/MILP、不重写 Temporal/Memory OS、不拆 HTTP 入口、不增人格、不扩展 Legacy、不做更多目的地链、不做完整 KG、不把卫星接口塞回主链。

---

## 13. Canonical Authority Rollout Playbook

> **前提**：Authority Harness 58/58 已绿；Gateway 输出 `authority_audit_v1` / `authority_gateway_v1` / `replay_strict_seal_v1`。  
> **原则**：先观测 → 再 ingress 权威 → 最后全局 ENFORCE；每阶段只改 **一个** 主 flag。  
> **Staging env 片段**：仓库根目录 `.env.canonical-authority-staging.example`（按 Phase 复制粘贴）。  
> **Phase 1 Staging PR 模板**：`PHASE1_STAGING_DEPLOY_PR_BODY.md`（可直接 `gh pr create --body-file`）。

### 13.1 Day 0 — Ramp 前基线

**P0 egress（生产应已安全，确认一次）：**

| 变量 | 建议生产值 | 作用 |
|------|-----------|------|
| `LEGACY_MUTATION_WRITE_GUARD` | `ENFORCE` | Legacy 不得 silent write |
| `ASYNC_MUTATION_WRITE_GUARD` | `ENFORCE` | Async resume/commit 双检 |
| `AGENTIC_MUTATION_WRITE_GUARD` | `ENFORCE` | Fast Path 写工具拦截 |
| `EFFECTIVE_PLAN_WRITE_CHAIN` | `1` | applyRepair / 时间轴 draft-only |

**必看 observability 字段：**

- `authority_gateway_v1.conclusion` → `READ_ONLY` \| `PARTIAL` \| `BYPASS` \| `CANONICAL`
- `authority_audit_v1.bypassDetected` · `reasonCodes`
- `replay_strict_seal_v1`（replay 路径）

**基线指标（Ramp 前录 24–48h）：** 写路径 `conclusion=BYPASS` 占比 · Legacy 熔断次数 · `fallback_used`（replay 应为 0）· 非 execute/rollback 的 `setEffective` 次数。

### 13.2 Phase 1 — Effective Plan Write Guard 观测（Week 1）

```bash
EFFECTIVE_PLAN_WRITE_GUARD=SHADOW
```

目标：观测 `setEffective` 旁路，不阻断业务。  
**Go：** SHADOW 旁路可解释 · 错误率无升 · BYPASS 基线已录。  
**Rollback：** `OFF`（staging）或移除显式 SHADOW。

### 13.3 Phase 2 — Effective Plan Write Guard ENFORCE（Week 2）

```bash
EFFECTIVE_PLAN_WRITE_GUARD=ENFORCE   # prod 未设 env 时默认已是 ENFORCE
```

**Go：** Iceland L2 / harness:authority 绿 · 非 canonical apply 显式拒绝。  
**Rollback：** `SHADOW` → `OFF`。

### 13.4 Phase 3 — Constraint Gateway 双轨观测（Week 3）

```bash
CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE
```

目标：Gateway 运行，legacy 仍为 authority；收集 divergence。  
**Go：** 分歧率 < 2%（写路径）· 零「legacy BLOCK → canonical PASS」漏报。  
**Rollback：** `CONSTRAINT_GATEWAY_MODE=OFF`

### 13.5 Phase 4 — Gateway 选择性权威（Week 4–5）

```bash
CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED
CONSTRAINT_GATEWAY_ON_SCENARIOS=iceland-road-closed
```

逐步扩展（每 scenario 观察 ≥3 天）：`weather-outdoor-storm` · `daily-load-excessive` · `opening-hours-conflict`  
**Go：** AU-P1-007 L2 仍绿 · 对应写路径 BYPASS 下降。  
**Rollback：** 缩小 `ON_SCENARIOS` 或退回 `SHADOW_COMPARE`

### 13.6 Phase 5 — Gateway 全局权威（Week 6+）

```bash
CONSTRAINT_GATEWAY_MODE=ON
RFC001_SHADOW_MODE=0
# 可选：DECISION_RUNTIME_MODE=CANONICAL · CANONICAL_EXECUTION_ENABLED=1
```

**Canonical = Yes 判据：** 写路径 `conclusion=BYPASS` < 1% · 无 `bypassDetected + mutationCommitted` · Ledger 闭环可抽样验证。  
**Rollback：** 逐级 `ON` → `ON_FOR_SELECTED` → `SHADOW_COMPARE` → `OFF`（勿跳级）。

### 13.7 Replay 确定性（与 Phase 3–5 并行）

`replay_from_trace` 自动设置 `orchestration_replay_strict_seal=true` · `execution_model_allow_upgrade=false`。  
**抽检：** `replay_strict_seal_v1.sealed=true` · 同 trace 重放 `fresh_llm_calls=0` · `fallback_used=false`。

### 13.8 每阶段 Go / No-Go

| 检查项 | Go |
|--------|-----|
| `npm run harness:authority` | 58/58 |
| P0 写 guard 默认 ENFORCE | ✓ |
| Deploy 后 1h 错误率 | ≤ 基线 + 0.5% |
| 写路径 BYPASS 占比 | 不高于上阶段 |
| 「行程被偷偷修改」工单 | 0 新增 |
| Rollback 脚本已演练 | ✓ |

### 13.9 Ramp 时间线

```
P0 egress ENFORCE (默认)
  → EFFECTIVE_PLAN SHADOW → ENFORCE
  → GATEWAY SHADOW_COMPARE → ON_FOR_SELECTED → ON
  → Canonical = Yes
```

### 13.10 Ramp 期间明确不做

不扩展 status_v2 assembler / 三人格 runtime · 不增编排模式 · 不缩短 trip 写锁 TTL · 不切换 CP-SAT/Temporal。
