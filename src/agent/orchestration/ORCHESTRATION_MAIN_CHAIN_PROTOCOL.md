# 主链编排协议（Main Chain Protocol SSOT）

> **协议版本**：`1.0.0`（`MAIN_CHAIN_PROTOCOL_VERSION`）  
> **代码 SSOT**：`orchestration-main-chain-protocol.constants.ts` · `graph/edges/main-chain.edges.ts` · `plan-verify-loop.edges.ts` · `pre-plan-graph.runner.ts`  
> **预算 SSOT**：[ORCHESTRATION_GOVERNANCE_MATRIX.md](./ORCHESTRATION_GOVERNANCE_MATRIX.md) · `orchestration-governance-matrix.constants.ts`  
> **产品入口**：[AGENT_UNIFIED_INTERFACE_SCOPE.md](../delivery/AGENT_UNIFIED_INTERFACE_SCOPE.md)  
> **原则**：冻结节点序与确认点；不扩顶层节点；Breaking 变更需 bump 协议版本。

---

## 0. 范围

本协议覆盖 Claude SM / `route_and_run` **编排态主链**（含中间节点、环预算指针、短路与用户确认点）。

**不在范围**：产品 `route_class` 路由协议、Planning Workbench 平行管道、`/agent/actions/*`、Consumer Exploration。

---

## 1. 节点序与子图边界

```
pre_plan:
  intake → state_update → research → poi_selection → gate_eval → context_build
plan_gen:
  plan_gen
plan_verify:
  optimize → verify ⇄ repair
  verify ──RETURN_TO_RESEARCH──→ research（外环，预算见 §3）
post_plan:
  narrate → feedback → hallucination → END
```

| 子图 | 入口 | 出口 |
|------|------|------|
| pre_plan | `intake`（默认）或 resume `state_update`；R2R 重入 `research` | `context_build` |
| plan_gen | `context_build` 之后 | 空草案短路 / 进入 plan_verify |
| plan_verify | `optimize` | VERIFY complete → post_plan；fatal / 预算 → 终端 |
| post_plan | plan_verify 成功后 | `hallucination` → END |

常量：`MAIN_CHAIN_PRE_PLAN_NODES` · `MAIN_CHAIN_PLAN_VERIFY_*` · `MAIN_CHAIN_POST_PLAN_NODES` · `MAIN_CHAIN_OBSERVED_NODE_ORDER`。

---

## 2. 环预算（指针，数值以治理矩阵为准）

| 旋钮 | 默认 | Env |
|------|------|-----|
| REPAIR 次数 | 3 | `DECISION_MAX_REPAIR_COUNT` |
| plan-verify 图步 | 8 | `DECISION_PLAN_VERIFY_MAX_GRAPH_STEPS` |
| 效用衰减 | 2 | `DECISION_REPAIR_UTILITY_DECAY_MAX` |
| RETURN_TO_RESEARCH | 1 | `DECISION_MAX_VERIFY_RESEARCH_RETRIES` |
| R2R 开关 | on | `DECISION_VERIFY_RETURN_TO_RESEARCH` |

运行时 echo：`observability.trace.orchestration_governance_limits_v1`。

---

## 3. RETURN_TO_RESEARCH（定向闭环）

| 规则 | 要求 |
|------|------|
| 触发码 | `EVIDENCE_SNAPSHOT_UNBOUND` · `EVIDENCE_VERSION_MISMATCH` · `REQUIRED_INPUT_MISSING` |
| Payload | 必须写入 `metadata.return_to_research_context_v1`（codes / missing_evidence / scopes / forbid_full_research） |
| 失效范围 | **定向** `research_scopes_to_recompute`，禁止默认清空全部资产域 |
| Scope Planner | `planResearchScopes()`（`research-scope-planner.util.ts`）：r2r > dos > options > nlu |
| 再研究 | 优先 `scoped_partial`；无 prior 时才允许显式标注的 forced full（遥测必记） |
| 超预算 | 不再无目标全量 RESEARCH |

POI 候选流水线（`poi-candidate-pipeline.util.ts`，挂在 `poi_selection` 内）：`entity_align → dedupe → eligibility → user_match → route_match → evidence_check`。  
`entity_align` 消费 ER Qdrant 同源离线目录（`er-catalog-lookup.util.ts`），命中写入 `__er_entity_id` 并优先按实体去重。

---

## 4. 短路表

见常量 `MAIN_CHAIN_SHORT_CIRCUITS`（INTAKE 澄清、GATE BLOCK/确认、空草案、VERIFY fatal、REPAIR/步数预算等）。

---

## 5. 用户确认点

见常量 `MAIN_CHAIN_USER_CONFIRM_POINTS`（Abu、REPAIR halt、协商、瑕疵草案 opt-in 等）。

默认：**超 REPAIR 预算 → `NEED_CONFIRMATION`**，非静默瑕疵 SUCCESS。`allow_flawed_draft_narrate` 为**显式 opt-in（仅 `true`）**；绑定 trip 缺省不放行。瑕疵交付时 `delivery_verdict=FLAWED_DRAFT`，禁止 AUTO 写回。

---

## 6. Kernel 权威路径

权威路径：`KERNEL_NATIVE_EXECUTION=true`（默认）。Legacy callback / NarratorAgent 降级必须写入 `phase_execution_path_v1`（`system_action: KERNEL_LEGACY_FALLBACK | NARRATOR_AGENT_FALLBACK`），**禁止静默降级**。

---

## 7. 契约测试

- `orchestration-main-chain-protocol.contract.spec.ts` — 节点序与边表对齐  
- `orchestration-governance-matrix.contract.spec.ts` — 预算默认值  
- R2R：`return-to-research-context.util.spec.ts` + 既有 e2e/chain specs  

---

*维护：与 `ClaudeOrchestratorService.orchestrateWithStateMachine` · 图调度器边表同步。*
