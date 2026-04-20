---
name: harness-runtime
description: >-
  实现与审阅 TripNARA Harness Runtime：步骤契约、执行上下文投影、确定性校验
 （P0 幂等键 idempotency + 证据版本绑定 evidence-version-binding）、分级故障、
  含 decisionJustification 的 trace/replay，以及 grader 对等性/反自我认同。
  在编辑或设计 src/harness/、围绕 harness 步骤的编排、决策 trace 存储、或
  docs/Harness Runtime.md 时使用。
---

# Harness Runtime（TripNARA）

**快捷唤起**：在 Agent 中输入 **`/harness`**（`.cursor/capabilities/harness/`）。

## 两层 Harness（必须区分）

| 层 | 位置 | 职责 |
|----|------|------|
| **Kernel Harness Runtime**（执行治理） | `src/harness/` | 步骤契约、DSO 读写边界、确定性校验、故障分级、内存 trace、回放/轨迹导出 |
| **Evaluation Harness**（决策评估 / 发布治理） | `scripts/`、`replay-cgus-*`、`compare-cgus-replay-reports`、`baselines/cgus` | case / suite、run 配置、replay/compare、`runFingerprint`（含 **`runId`**）、`traceRefs`、`comparisonSummary`、基线门禁 |

**打通索引（P1）**：`POST /agent/route_and_run` 可传 **`meta.run_id`**（与报告 `runFingerprint.runId` 使用同一 UUID）；DSO `harnessRuntime.evaluationRunId` → 开启 `HARNESS_RECORD_TRACE=1` 时 **`HarnessTrace.meta.evaluationRunId`**。另设 **`HARNESS_TRACE_EXPORT_DIR`** 时，收口后落盘 JSON，**`traceRefs.path` / `observability.harness_trace_export_path`** 与 **`traceRefs.traceId` / `observability.harness_active_trace_id`** 填实；纯 CGUS 优化器脚本路径无 API 时 `traceRefs` 仍为占位，由 HTTP 评测聚合脚本用 **`traceRefFromRouteAndRunObservability`** 合并。`compare` 输出 **`traceHints`**。

## 硬性原则（不可协商）

- Harness 对 DSO / 决策状态只返回 **patch**，禁止随意整状态覆盖写。
- **步骤不得绕开 Gate**：`gateResult` 缺失或为 `BLOCK` 时禁止 `PLAN_GEN`。
- **证据冻结 + 版本**：RESEARCH 落盘不可变快照与 `evidenceVersion`；VERIFY 必须绑定该快照；异步刷新只能产生新版本，禁止静默覆盖已绑定依据。
- **Harness Engineer 一票否决（产品/发布策略）**：无法 **自动化验证** 或无法 **按 trace 还原** 的功能，在补齐契约与 trace 前不得上线。

## P0 落地顺序（Phase 1）

1. Step Contract Registry（对产出/消费 research 的契约声明 `evidenceVersion`）。
2. `ExecutionContext` + `StateProjectionService`（仅可读/可写路径）。
3. 确定性校验器 — **优先**：`idempotency-key.validator`（重试下工具调用与写入幂等；计费与地图/DEM 安全），**其次**：`evidence-version-binding.validator`。
4. 分级故障路由（L1/L2/L3 + `suggestedAction`）。
5. Trace 记录 — 每步持久化校验结果、工具摘要、**`decisionJustification`**、证据版本引用。

## 推理型 Grader（对应文档 7.4.1）

- Grader 所用模型能力应 **≥ 执行步模型**，或 **不同厂商/不同角色**（如红队 rubric），并在配置中显式区分 `executorModel` 与 `graderModel`。
- Grader 输入必须使用 **已冻结**、版本绑定的证据，不得直接读「最新异步缓存」替代快照。

## 环境变量（Kernel 集成）

- **`HARNESS_RECORD_TRACE=1`**：`DecisionKernelService` 在调用 `HarnessStepRunner.runStep` 时 **写入** `HarnessTraceRecorderService` 内存 trace（默认 `skipTrace`，避免长进程堆积；回放/nightly 再打开）。**Harness 任一步失败**时，Kernel 会调用 **`HarnessStepRunner.finalizeRecordedTrace(traceId, 'FAILED'|'BLOCKED')`**，避免 trace 长期停留在默认 `DONE`。**`HarnessTraceRecorderService.appendStep`**：若 trace 已 **`finalize`/`finalizeIfStillOpen` 闭合**（`endedAt` 已存在），**不再追加**并 **`warn`**。
- **`HARNESS_TRACE_MAX_ENTRIES`**（可选，正整数）：内存中同时保留的 trace 条数上限；新建 trace 且将超限时按 **FIFO** 删除最旧条目（见 `HarnessTraceRecorderService`）。
- **`HARNESS_RELAX_USER_INTENT_BUDGET=1`**：跳过 **RESEARCH / INTAKE / PLAN_GEN** 的 `user-intent-budget` 校验（仅 dev）。
- **`HARNESS_RELAX_SYSTEM_REQUEST_ID_MATCH=1`**：跳过 **`system-request-id.validator`**（`systemState.requestId` 与 `context.requestId` 对齐检查；仅 dev）。
- **`HARNESS_RELAX_GATE_RESEARCH_SNAPSHOT=1`**：跳过 GATE 的 `research-snapshot-present` 校验（仅 dev/兼容未跑 Kernel RESEARCH 的路径；**禁止生产默开**）。
- **`HARNESS_RELAX_VERIFY_EVIDENCE_BINDING=1`**：跳过 VERIFY 的 `evidence-version-binding` 校验（同上）。
- **`HARNESS_RELAX_VERIFY_DATE_CONTINUITY=1`**：跳过 VERIFY 的 `itinerary-date-continuity` 校验（仅 dev）。
- **`HARNESS_DATE_CONTINUITY_ALLOW_GAPS=1`**：VERIFY 行程日期仍须可解析、递增且无重复，但**允许**相邻日之间非连续自然日（休息日空档）。
- **`HARNESS_RELAX_VERIFY_BUDGET_OVERRUN=1`**：跳过 VERIFY 的 `budget-overrun` 校验（仅 dev）。
- **`HARNESS_VERIFY_BUDGET_OVERRUN_MAX`**（可选，0–1）：`tripState.budgetOverrun` 允许的上限，默认 `1`；设更小可对「接近耗尽」提前 L2。
- **`HarnessStepRunner.runStep(..., { finalizeTrace: 'FAILED' | ... })`**：在 **`skipTrace: false`** 且本步已 `appendStep` 后闭合整条内存 trace（单测 / 显式收尾；Kernel 默认仍 `skipTrace` 可不传）。
- **`HARNESS_SKIP_INFERENTIAL=1`**：`HarnessStepRunner` 在确定性校验全通过后 **不运行** 契约上的 `inferentialGraders`（压测 / 快速路径；**禁止生产默开**）。
- **`HARNESS_GRADER_MODEL` / `HARNESS_EXECUTOR_MODEL`**（可选）：写入 `HarnessExecutionContext.metadata`，供审计与后续真实 grader 对齐文档 7.4.1。
- **`HARNESS_TRACE_EXPORT_DIR`**（可选，非空目录）：在 `finalizeHarnessTraceIfRecorded` **先 finalize 再 export**；默认写入 **`<dir>/<YYYY-MM-DD>/<safeTraceId>.json`**（`YYYY-MM-DD` 取 `trace.endedAt` 的 UTC 日历日，便于长期归档）；**`HARNESS_TRACE_EXPORT_FLAT=1`** 时改为扁平 **`<dir>/<safeTraceId>.json`**。成功时把 **相对 `process.cwd()` 的 POSIX 路径**写入 DSO `harnessRuntime.traceExportRelativePath`；**导出失败只打 warn、返回 null，不阻断 `route_and_run`**，且 **不写 path**（`traceId` / `runId` 仍可由客户端与评测侧保留）。`route_and_run` 的 **`observability.harness_*` / `evaluation_run_id`** 与之对齐。评测聚合：`scripts/lib/evaluation-harness-report-refs.ts` 的 **`traceRefFromRouteAndRunObservability`**。落盘 payload 最小：**`{ exportedAt, trace }`**。

**全链路 HTTP 评测脚本**：`npm run eval:route-and-run:trace`（`scripts/eval-route-and-run-trace.ts`）— 对 `POST /api/agent/route_and_run` 带 **`meta.run_id`**，断言 **`observability.harness_trace_export_path`**、磁盘文件存在，并写出含 **`traceRefs.path`** 的 JSON 报告。可选 Jest：`RUN_ROUTE_AND_RUN_TRACE_ACCEPTANCE=1 TRIPNARA_API_BASE=... npx jest scripts/lib/route-and-run-trace-eval.acceptance.spec.ts`。

## 代码目录（目标形态）

新增与调整代码对齐 `docs/Harness Runtime.md` 第 4 节：`src/harness/runtime/`、`contracts/`、`validators/deterministic|inferential/`、`failures/`、`tracing/`、`eval/`、`exporters/`。

## Kernel 侧行为（已实现）

- **GATE_EVAL**：`research-snapshot-present.validator` — 无 `harnessRuntime.researchEvidenceSnapshotId` 时 Harness 失败；Kernel **硬阻断**：不调用 `gateEvalExecutor`，合并 `constraints.gateOutcome=BLOCK` 并返回合成 `gateResult`。
- **INTAKE / REPAIR**：幂等键分别为 `intake:${requestId}`、`repair:${requestId}:v${version}`；Harness 未通过则短路、不调用对应 executor。
- **RESEARCH / PLAN_GEN / VERIFY**：见 `HarnessStepName` 与 `shouldSkipHarnessTrace()`。
- **NARRATE**：契约含 **`idempotency-key.validator`** 与 `requireIdempotencyKey`；Kernel `executeNarrate` 在调用 `narrateExecutor` 前 `runStep(NARRATE, …, idempotencyKey: narrate:${requestId})`，失败则返回空 `narration`。`requiredInputPaths`（如 `tripState`）在 **`HarnessStepRunner`** 内与确定性校验器一并强制执行。
- **`decisionJustification`**：Kernel 每次 `runStep` 传入简短 `summary`（便于开启 `HARNESS_RECORD_TRACE` 后锚定因果链）。
- **编排收口**：`DecisionKernelService.finalizeHarnessTraceIfRecorded(dso, finalStatus)`（`HarnessStepRunner.finalizeRecordedTraceIfStillOpen`）在 **`HARNESS_RECORD_TRACE=1`** 时为仍开放的 trace 写入 `endedAt`；**`ClaudeOrchestratorService`** 在 `buildSuccessResult` / `buildBlockedResult` / `buildClarificationResult` / `buildErrorResult` 返回前调用；**`ReplanCoordinatorService`** 在 replan 持久化成功/异常时 **`DONE` / `FAILED`**。单测：`decision-kernel.finalize-harness-trace.spec.ts`、`claude-orchestrator.finalize-harness-trace.spec.ts`、`replan-coordinator.*.spec.ts`；索引见 `docs/Harness Runtime.md` §10.3。

## 回放 / 导出 / Grader 占位（已实现骨架）

- **`HarnessReplayBuilderService`**：`buildReplayPayload(traceId)`，基于 `HarnessTraceRecorderService`。
- **`HarnessTrajectoryExporterService`**：`toExportable(trace)` → `HarnessExportableTrajectory`（§12.1 对齐字段；汇总 `graderResults` 的 L2/L3）。
- **`HarnessInferentialGradersFacade`**：可 `register(grader)`；内置 **`stub-pass.grader`**（恒通过）、**`pacing-heuristic.grader`**（无 LLM：按 `planDraft.days[*].items` 长度启发式判 L2）。**`PLAN_GEN`** 契约默认挂载 pacing grader。契约 `inferentialGraders` 非空时，**`HarnessStepRunner`** 在**确定性校验全通过**且未设 `HARNESS_SKIP_INFERENTIAL` 后依次执行 grader；失败经 **`HarnessFailureRouterService.eventsFromGraderResults`** 进入 `failureEvents`；**`HarnessTraceStep.graderResults`** 会落 trace。

## PR / 评审清单

- [ ] 契约列出 `readableStatePaths` / `writableStatePaths`；VERIFY 不回写 research。
- [ ] 凡改动重试或外部调用路径，覆盖 P0 校验器相关场景。
- [ ] 当步骤改写 plan / gate / verify 叙事时，trace 步须含 `decisionJustification`。
- [ ] 故障事件携带 `level`、`type`、`code`、`suggestedAction`。
- [ ] 与 orchestrator 的集成是 **包装后的** step executor，禁止旁路钩子绕开 Harness。

## 协作（人工流程）

遵循 `.claude/role-router.md` 与 `docs/Harness Runtime.md` 第 13 / 17 节：与 **架构师**（服务边界）、**Agent/Orchestrator 负责人**、**Decision Kernel**（patch 口径）、**QA**（eval / golden）、以及涉及幂等、外部 API 或 trace 中敏感信息时的 **安全** 角色对齐。

## 文档为准

接口命名与分阶段范围以 `docs/Harness Runtime.md` 为准；若实现有意偏离，须同步修订该文档。

## 相关工程 Skill（主线分工）

与 Harness 步骤相邻的实现主线见项目 **`.cursor/capabilities/`** 下：`orchestration-mainline`、`decision-kernel-engineering`、`optimization-candidate-search`、`cgus-engineering`、`verify-mainline`、`replay-evaluation`、`reinforcement-learning`、`rag-engineering`（各包内 `SKILL.md`）。

**角色映射与工程小队提示词**：**`.cursor/org/decision-platform-roles/`**（`reference-role-mapping.md`、`prompts-engineering-squads.md`）。

**强化学习 / 轨迹导出**：`reinforcement-learning` Skill；快捷 **`/rl`**。
