# 编排图重构 Backlog：节点 / 边 草案

本文档将 `ClaudeOrchestratorService.orchestrateWithStateMachine` 的**隐式线性流程**映射为可执行的**图调度模型**，与现有代码一一对应，便于渐进拆分（不必退回 LangGraph 主链）。

**对照源码（2026-05）**

| 概念 | 路径 |
|------|------|
| 主入口 | `src/agent/services/claude-orchestrator.service.ts` → `orchestrateWithStateMachine` |
| Harness 步骤枚举 | `src/harness/contracts/harness-step.types.ts` → `HarnessStepName` |
| 步骤契约 / 失败路由 | `src/harness/runtime/harness-step-contract.registry.ts`、`harness-failure-router.service.ts` |
| 步骤顺序（Kernel） | `src/harness/runtime/harness-step-runner.service.ts` → `HARNESS_STEP_ORDER` |
| 统一出口 | `src/agent/services/agent.service.ts` → `route_and_run` |

---

## 1. 目标架构（一层图调度器 + 节点处理器）

```text
RouteAndRunRequest + AgentContext + Deadline
        │
        ▼
┌───────────────────┐
│ OrchestrationGraph │  ← 新建：只负责「下一跳」与墙钟预算
│ Scheduler          │
└─────────┬─────────┘
          │ runNode(name, ctx)
          ▼
   ┌──────────────┐     ┌─────────────────────┐
   │ NodeHandlers │────▶│ SharedRunContext     │
   │ (7+ 子模块)   │     │ - OrchestratorState  │
   └──────────────┘     │ - DecisionState (DSO)│
                        │ - ContextPackage ref │
                        │ - Deadline           │
                        └─────────────────────┘
```

**原则**

- `ClaudeOrchestratorService` 退化为 **facade + 节点注册表**，不再承载 200+ 行顺序 `if`。
- **业务逻辑**迁入 `src/agent/orchestration/nodes/*.handler.ts`（名称可调整）。
- **Harness** 的 `validateStepAdmission` / `HarnessFailureRouter` **驱动边**，与编排图边表合并（避免两套语义）。

---

## 2. 节点目录（Node Catalog）

### 2.1 Harness 对齐节点（7 + 扩展）

| 图节点 ID | `HarnessStepName` | `OrchestratorState.current_step`（执行中） | 现有方法（Phase / Step） | 进度 API `touchAsyncTaskProgress` |
|-----------|-------------------|------------------------------------------|--------------------------|-----------------------------------|
| `intake` | INTAKE | INTAKE | `executeIntakeStep` | INTAKE |
| `state_update` | —（DSO 同步，无 Harness 枚举） | STATE_UPDATE | `executeStateUpdateStep` | — |
| `research` | RESEARCH | RESEARCH | `executeResearchPhase` → `executeResearchStep` | RESEARCH |
| `poi_selection` | — | POI_SELECTION | `executePoiSelectionStep` | — |
| `gate_eval` | GATE_EVAL | GATE_EVAL | `executeGateEvalPhase` → `executeGateEvalStep` | GATE_EVAL |
| `context_build` | — | CONTEXT_BUILD | `executeContextBuildStep` | — |
| `plan_gen` | PLAN_GEN | PLAN_GEN | `executePlanGenPhase` → `executePlanGenStep` | PLAN_GEN |
| `optimize` | — | OPTIMIZE | `executeOptimizeStep` | — |
| `verify` | VERIFY | VERIFY | `executeVerifyPhase` → `executeVerifyStep` | VERIFY |
| `repair` | REPAIR | REPAIR | `executeRepairPhase` → `executeRepairStep` | REPAIR |
| `narrate` | NARRATE | NARRATE | `post-plan/narrate-phase.executor`（`runNarratePhase`）+ `nodes/narrate.node` | NARRATE |
| `feedback` | — | FEEDBACK | `post-plan/feedback-phase.executor`（`runFeedbackPhase`）+ `nodes/feedback.node` | — |
| `hallucination` | — | DONE（终端） | `post-plan/hallucination-phase.executor` + `nodes/hallucination.node` | — |

**子图（建议 P0 先抽）**

| 子图 ID | 包含节点 | 说明 |
|---------|----------|------|
| `plan_verify_loop` | `plan_gen` → `optimize` → `verify` → (`repair` → `optimize`?)* | 见 §3.3；LangGraph 可选只包此子图 |
| `pre_plan` | `intake` → `state_update` → `research` → `poi_selection` → `gate_eval` → `context_build` | 证据与门控 |
| `post_plan` | `narrate` → `feedback` → `hallucination` | 只读叙述，不改硬字段 |

### 2.2 终端节点（非 Harness Step）

| 终端 ID | 触发条件（现有） | 现有出口方法 |
|---------|------------------|--------------|
| `terminal_clarification` | `shouldReturnClarificationForHardGaps`、槽位澄清、EARLY_WARNING 等 | `buildClarificationResult` |
| `terminal_blocked` | `gate_result === 'BLOCK'` | `buildBlockedResult` |
| `terminal_done` | 正常完成 / POI fallback DONE | `buildSuccessResult` |
| `terminal_failed` | VERIFY FATAL、`FAILED` | `buildErrorResult` |
| `terminal_no_solution` | `TERMINAL_NO_SOLUTION` | `buildTerminalNoSolutionResult` |
| `terminal_timeout` | deadline 耗尽 | `buildErrorResult`（TIMEOUT） |

---

## 3. 边表（Edge Table）

### 3.1 主链（Happy Path）

```text
START
  → intake
  → state_update
  → [guard: terminal_clarification | terminal_no_solution]
  → research
  → poi_selection
  → [guard: clarification | fallback DONE]
  → gate_eval
  → [guard: debate short-circuit | BLOCK]
  → context_build
  → plan_gen
  → optimize
  → verify
  → [guard: FATAL → terminal_failed]
  → [guard: ADJUST_REQUIRED | errors → repair]
  → narrate
  → feedback
  → hallucination
  → terminal_done
```

### 3.2 条件边（与现有代码对齐）

| 从 | 条件 | 到 | 代码锚点 |
|----|------|-----|----------|
| `intake` | `resumeSkipIntake`（DSO lastStep=INTAKE 已完成） | `state_update` | `orchestrateWithStateMachine` L6631–6637 |
| `intake` | `terminal_intent === TERMINAL_NO_SOLUTION` | `terminal_no_solution` | L6665–6674 |
| `intake` | `shouldReturnClarificationForHardGaps` | `terminal_clarification` | L6677–6705 |
| `research` | ClarifyEndpoints 拦截 | `terminal_clarification` | RESEARCH 后 transport 澄清 |
| `research` | EARLY_WARNING intercept | `terminal_clarification` | L7150–7174 |
| `poi_selection` | `allowWithFallback` | `terminal_done` | L7182–7190 |
| `poi_selection` | `needsClarification` | `terminal_clarification` | L7192–7197 |
| `gate_eval` | `debateShortCircuit` 非空 | （辩论融合出口，可能 DONE/澄清） | L7206–7217 |
| `gate_eval` | `gate_result === 'BLOCK'` | `terminal_blocked` | L7221–7225 |
| `plan_gen` | `planGenTerminalFailure` / 空草案 | `terminal_clarification` 或专用 halt | L7237+ |
| `verify` | `verification.hasFatal` | `terminal_failed` | L7556–7569 |
| `verify` | `ADJUST_REQUIRED` 或 `errors.length` | `repair` | L7572–7575 |
| `verify` | 否则 | `narrate` | L7654+ |
| `repair` | `repairCount >= DECISION_MAX_REPAIR_COUNT` | `terminal_clarification` | L7632–7651 |
| `repair` | `consecutiveUtilityDeclines >= DECISION_REPAIR_UTILITY_DECAY_MAX` | `terminal_clarification` | L7607–7624 |
| `*` | `deadline.isExpired()` | `terminal_timeout` | catch / gateway |

### 3.3 子图 `plan_verify_loop`（回溯语义 — **目标态**）

**现状**：同一次 run 内 `verify → repair → (kernel optimize)`，然后**继续** `narrate`；**不会**自动跳回 `research`。

**目标边（Harness 已声明，编排未接齐）**

| 从 | Harness / Router 建议 | 到 | 状态清洗 |
|----|------------------------|-----|----------|
| `verify` | L2 → `RETURN_TO_RESEARCH` | `research` | 失效 `harnessRuntime.researchEvidenceSnapshotId`；`research_scope_invalidation` |
| `verify` | L1 → `RETRY` | `plan_gen` | 保留 gate；递增 `planGenRetryCount` |
| `repair` | 超过 `maxRepairs` | `terminal_clarification` | 已有 |
| `plan_gen` | 超过 `planGenRetry` + 同 fingerprint | `terminal_clarification` | DSO `consecutiveSameRelaxationAttempts` |

实现时：**图调度器**读取 `HarnessFailureEvent.suggestedAction`，映射为上表「到」节点；`DecisionKernel.validateStepAdmission` 的 `suggested_fallback_step` 与边表共用一张配置（YAML/TS 常量）。

### 3.4 Durable Resume 边

| 输入 | 行为 | 代码锚点 |
|------|------|----------|
| `resume.decision_state` | `computeResumeHarnessEntryFromLast` → 从下一 Harness 步开始 | L6584–6617 |
| admission 失败 | 回退全新 DSO，从 `intake` | L6596–6604 |

`HARNESS_STEP_ORDER`（Kernel）与编排主链顺序一致：

`INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → REPAIR → NARRATE`

编排额外插入：`state_update`、`poi_selection`、`context_build`、`optimize`、`feedback`、`hallucination` — 图模型里记为 **「扩展节点」**，不写入 Harness 枚举，但占用 `OrchestratorState.current_step` 便于 UI。

---

## 4. 共享状态契约（Reducer 规则）

### 4.1 三层状态（禁止子 Agent 私传非标字段）

| 层 | 类型 | 谁可写 | 用途 |
|----|------|--------|------|
| **A. DSO** | `DecisionState` | Kernel + `*Phase` 经 `decisionKernel.updateState` | 规划/验证/修复真值 |
| **B. Orchestrator** | `OrchestratorState` | 各 `execute*Step` | UI、`decision_log`、`gate_result`、`itinerary` |
| **C. Context** | `ContextPackage` | **仅** `ContextEngineerService.build` | LLM 只读块；按 phase/agent 缓存 |

**收紧规则（Backlog 验收）**

1. 新增字段只允许：`DecisionState` 子树、`OrchestratorState.metadata`（带 schema）、`ContextPackage.blocks[]`。
2. 禁止：在 `request` 上挂 `REQUEST_FITNESS_*` 式临时键以外的**新** top-level 扩展（体能块迁移到 DSO `travelPreference` 或 Context block）。
3. 节点间只传 `SharedRunContext`（指针），不传递 `any` payload。

### 4.2 Context Package 与节点 phase 映射

| 节点 | `ContextEngineerService.build` phase | agent |
|------|-----------------------------------|-------|
| research | RESEARCH | Planner |
| gate_eval | GATE_EVAL | Gatekeeper |
| plan_gen | PLAN_GEN | Planner |
| verify | VERIFY | Compliance |
| narrate | NARRATE | NarratorAgent |

现有 `context-engineer.service.ts` 已按 tripId + phase + agent 做 L1/L2 缓存；图调度器在节点入口调用 **同一** `build()`，出口只允许 `appendDecisionLog` / 更新 DSO。

---

## 5. 与 LangGraph 的边界

| 范围 | 建议 |
|------|------|
| **主 `route_and_run` 状态机** | 不用 LangGraph；用自研 `OrchestrationGraphScheduler` |
| **PLAN ↔ VERIFY ↔ REPAIR 内循环** | 可选 LangGraph 子图（3–4 节点），输出 `DecisionState` + `OrchestratorState` patch 回主图 |
| **决策子系统** | 保持现有 `LangGraphState` 投影（`context-engineer` / `narrator-agent`） |

LangGraph 子图出口契约：

```typescript
interface PlanVerifyLoopResult {
  decisionState: DecisionState;
  orchestratorPatch: Partial<OrchestratorState>;
  terminal?: 'continue_narrate' | 'clarification' | 'failed';
}
```

---

## 6. 分阶段 Backlog（建议顺序）

### Phase 0 — 文档与观测（1–2 天）

- [ ] 将本文档链接进 `agent.controller` 注释或 `docs/README`（若有）。
- [ ] 为每条边增加 metric：`orchestration_edge_transitions_total{from,to,reason}`。
- [ ] 对齐 `done_verify_guardrail` 与 `stepsExecuted`（已有 guard）。

### Phase 1 — 抽 `plan_verify_loop`（3–5 天，收益最大）

- [x] 新建 `plan-verify-loop` 模块：PLAN_GEN 空草案守卫 + `runPlanVerifyOptimizeRepairLoop`（原 L7237–7651 守卫）。
- [x] 定义 `plan-verify-loop.edges.ts` 常量表（§3.3）。
- [x] `orchestrateWithStateMachine` 主流程：`... → context_build → planVerifyLoop → post_plan graph ...`。
- [x] 单测：VERIFY FATAL、repairCount 超限、verify 无 repair 继续（`plan-verify-loop.runner.spec.ts`）。

### Phase 2 — 图调度器壳（3–5 天）

- [x] `OrchestrationGraphScheduler`：`run(entry, ctx)` + deadline 检查 + 边表查找。
- [x] `plan_verify_loop` / `post_plan`（narrate→feedback→hallucination）经调度器执行。
- [x] Durable resume：`computeResumeGraphEntryFromLast` + `metadata.graph_resume_entry` 日志。
- [x] `pre_plan` 链：`runPrePlanUntilContextBuild` + `runPrePlanFullChain`（`entry`/`shouldRun` 支持 Durable 与 VERIFY 回溯入口）。
- [x] `pre_plan` 逐节点调度：`runPrePlanNode` + `stopAfter`（每节点只跑一段 `runPrePlanFullChain`）；Gate 恢复 debate 短路。

### Phase 3 — 接 Harness 失败路由（2–4 天）

- [x] `verify` 失败后读取 `last_harness_failure_events`：`RETURN_TO_RESEARCH` → `reroute_pre_plan` → `pre_plan` from `research`（`DECISION_MAX_VERIFY_RESEARCH_RETRIES`）。
- [x] `validateStepAdmission` / 图边共用：`harness/lib/harness-step-order.ts` + `harness-orchestration-edge.registry.ts`。
- [x] 单测：`EVIDENCE_SNAPSHOT_UNBOUND` → `RETURN_TO_RESEARCH` → `reroute_pre_plan`（`plan-verify-loop.runner.spec.ts`）。
- [x] E2E（真实 Kernel Harness）：`evidence-version-binding` 失败 → `RETURN_TO_RESEARCH` → `reroute_pre_plan`（`verify-return-to-research.harness-e2e.spec.ts`：HarnessStepRunner + `executeVerify` + plan-verify 图）。
- [x] E2E（编排全链）：`reroute_pre_plan` → `pre_plan(research)` → `plan_gen` → `plan_verify`（`verify-return-to-research-retry.runner.ts` + `verify-return-to-research-orchestrator-chain.spec.ts`）。
- [x] HTTP smoke：`route_and_run` 观测 `verify_return_to_research_count`（`agent.route-and-run.verify-return-to-research.e2e.spec.ts`）。

### Phase 4 — Context 契约 lint（2 天）

- [ ] 禁止节点直接改 `OrchestratorState` 上大对象以外路径（eslint 自定义或 code review 清单）。
- [ ] 体能 / 长期偏好：统一为 Context public block 或 DSO 字段（收敛 `REQUEST_FITNESS_PROFILE_LINES_KEY`）。

### Phase 5 — LangGraph 可选子图（按需）

- [ ] 仅当 Phase 1 单测显示 repair 环路仍难维护时，将 `plan_verify_loop` 换为 LangGraph 编译图。
- [ ] 主调度器接口不变。

---

## 7. 文件布局建议（新代码）

```text
src/agent/orchestration/
  graph/
    orchestration-graph.scheduler.ts
    orchestration-graph.types.ts      # NodeId, Edge, SharedRunContext
    edges/
      main-chain.edges.ts
      plan-verify-loop.edges.ts
      terminal.edges.ts
  nodes/
    intake.node.ts
    research.node.ts
    gate-eval.node.ts
    context-build.node.ts
    plan-verify-loop.handler.ts       # Phase 1
    post-plan/
      narrate-phase.executor.ts
      feedback-phase.executor.ts
      hallucination-phase.executor.ts
      post-plan-graph.host.ts
      nodes/narrate.node.ts
      nodes/feedback.node.ts
      nodes/hallucination.node.ts
  orchestration-facade.service.ts     # 薄封装，替代 orchestrator 内联顺序逻辑
```

现有 `ClaudeOrchestratorService` 保留对外签名，内部委托 `OrchestrationFacadeService`。

---

## 8. 环境变量与守卫（迁移时勿丢）

| 变量 | 影响节点/边 |
|------|-------------|
| `DECISION_KERNEL_ENABLED` / `DECISION_KERNEL_AB_PERCENT` | 是否走 `*Phase` Kernel 路径 |
| `KERNEL_NATIVE_EXECUTION` | RESEARCH / GATE / PLAN / VERIFY / REPAIR 执行器 |
| `DECISION_MAX_REPAIR_COUNT` | repair → clarification |
| `DECISION_REPAIR_UTILITY_DECAY_MAX` | repair 后 optimize 衰减 |
| `HARNESS_SKIP_INFERENTIAL` | Harness grader |
| `HARNESS_RECORD_TRACE` | trace 收口 |

---

## 9. 验收标准（Phase 1 完成即算 MVP）

1. `claude-orchestrator.service.ts` 中 `orchestrateWithStateMachine` 主顺序体 **< 150 行**（守卫下沉到节点/边表）。
2. VERIFY FATAL / repair 超限 / PLAN 空草案 行为与重构前 **快照测试** 一致。
3. `RETURN_TO_RESEARCH` 至少有一条集成测试证明能回到 `research`（新能力，Harness 契约已有）。
4. 无新增 `OrchestratorState` 顶层随意字段；体能仍可通过 Hydrator 进入 DSO/Context。

---

## 10. 快速对照：你现在问的「回溯」在哪

| 用户期望 | 当前实现 | Phase 目标 |
|----------|----------|------------|
| VERIFY 失败 → REPAIR | ✅ 有 | 保留在 `plan_verify_loop` |
| REPAIR 后重新 VERIFY | ⚠️ 同 run 内隐式（repair 后 optimize，不一定二次 verify） | 边表显式 `repair → verify`（可选二次） |
| VERIFY/PLAN 失败 → RESEARCH | ✅ **已接入**（`verify-return-to-research-retry.runner` + E2E/HTTP smoke） | Phase 3 已完成；见 `docs/harness-1x-roadmap.md` |
| 跨请求恢复 | ✅ Durable + `resumeSkipIntake` | Phase 2 图入口 |

## 11. Post-Freeze（1.x）Harness 演进

Phase 1–3 完成后，1.x 四梯队规划见 **`docs/harness-1x-roadmap.md`**（Phase 4 收拢、eval 模块化、Shadow Grader、`HARNESS_TRACE_MODE=on-failure` 已落地最小集）。

---

*维护：编排重构时同步更新本节与 `HarnessStepContractRegistry` 注册步骤。*
