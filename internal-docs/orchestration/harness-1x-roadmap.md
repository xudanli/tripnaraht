# TripNARA 1.x Post-Freeze Harness 演进路线图

> **状态**：1.0 Feature Freeze 之后的主线规划。与本地 `docs/Harness Runtime.md`、[orchestrator-graph-refactor-backlog.md](./orchestrator-graph-refactor-backlog.md)（Phase 1–4b）互补。
>
> **模块与环境变量全景图：** [harness-architecture-map.md](./harness-architecture-map.md)

## 1. 物理架构演进依赖栈

```
┌───────────────────────────────────────────────────────────────────────┐
│ 梯队 4: 故障触发式 Trace ──► 依赖单点收口；与 Shadow Grader 指标可绑定   │
├───────────────────────────────────────────────────────────────────────┤
│ 梯队 3: 异步 Shadow Grader ──► PLAN_GEN / VERIFY 语义分 → 指标收集器   │
├───────────────────────────────────────────────────────────────────────┤
│ 梯队 2: 评测工程化 ──► scripts/ → src/harness/eval/ + 本地 baseline 门禁 │
├───────────────────────────────────────────────────────────────────────┤
│ 梯队 1: Phase 4 架构剥离 ──► Context Lint + 打碎 13.5k 行编排单体       │
└───────────────────────────────────────────────────────────────────────┘
```

## 2. 核心修正与校准项

### §10 对照表（编排 backlog）

**过时描述**：「VERIFY/PLAN 失败 → RESEARCH：Harness 建议有，编排未接」。

**事实**：`verify-return-to-research-retry.runner.ts` 已承载 `RETURN_TO_RESEARCH` → `reroute_pre_plan` → `pre_plan(research)`；测试链含 Harness E2E、编排链 spec、HTTP smoke（`verify_return_to_research_count`）。文档应记为 **【已接入主链路并具备 E2E 覆盖】**。

### Phase 4 拆分

| 切片 | 内容 | 验收 |
|------|------|------|
| **4a Context Lint** | ✅ **`OrchestratorContextLintService`**（`src/agent/orchestration/context/`）：Harness 契约派生 read/write/required；DSO 顶层白名单；禁止 `REQUEST_FITNESS_PROFILE_LINES_KEY` / `__*` 旁路；可见载荷 Size Guard；挂 **Kernel 全部 `execute*`**（`ORCHESTRATOR_CONTEXT_LINT_ENABLED=1`，`STRICT` 可选） | 单测 `orchestrator-context-lint.service.spec.ts` |
| **4b 编排解耦** | ✅ pre_plan 全链 Host 化；✅ plan-verify 执行体 + 循环胶水；✅ **post_plan 全子图**（NARRATE / FEEDBACK / hallucination → `post-plan/*-phase.executor` + `nodes/*.node`）；L2 `persistHarnessTraceOnReturnToResearch` | 薄包装 plan_gen/verify `*.node.ts`（拓扑美化，可选） |

## 3. HARNESS_TRACE_MODE 三态运行设计

| 模式 | 环境变量 | 行为 |
|------|----------|------|
| `off` | 默认（或未识别值） | 零 `appendStep`；失败不合成 |
| `full` | `HARNESS_TRACE_MODE=full` 或 **`HARNESS_RECORD_TRACE=1`（向后兼容）** | 逐步 append；编排出口 `finalizeHarnessTraceIfRecorded` |
| `on-failure` | `HARNESS_TRACE_MODE=on-failure` | 成功路径零 append；**Kernel `handleHarnessStepFailure` 单点** 调用 `HarnessTraceRecorderService.retrofitTrajectoryOnFailure`，并按 `HARNESS_TRACE_EXPORT_DIR` 落盘 |

### 实现锚点（已落地最小集）

- `src/harness/tracing/harness-trace-mode.util.ts` — `getHarnessTraceMode()`、`shouldSkipHarnessTraceAppend()`、`shouldRecordOnFailureRetrofit()`
- `src/harness/tracing/harness-trace-recorder.service.ts` — `retrofitTrajectoryOnFailure()`
- `src/decision/kernel/decision-kernel.service.ts` — `handleHarnessStepFailure()` / `buildOnFailureHarnessRuntimePatch()`，各 phase Harness 失败分支统一调用
- `src/harness/tracing/harness-trace-filesystem-export.service.ts` — `exportHarnessTraceIfConfigured(trace)`

详见 [harness-architecture-map.md §3](./harness-architecture-map.md#3-trace-三态与-kernel-失败单点)。

### 可选采样（仅 `full`）

- `HARNESS_TRACE_SAMPLE_RATE`（0–1）：成功路径 append 采样，与 `on-failure` 独立。

### 生产建议

```bash
# 默认：零 trace 内存开销
# HARNESS_TRACE_MODE=off

# 排障 / badcase 归档（需同时配置导出目录）
HARNESS_TRACE_MODE=on-failure
HARNESS_TRACE_EXPORT_DIR=artifacts/harness-on-failure
```

## 4. 梯队 2 — 评测防御网（已起步）

| 模块 | 路径 | 说明 |
|------|------|------|
| Nest 模块 | `src/harness/eval/harness-eval.module.ts` | `EvalFingerprintService` / `EvalSuiteLoader` / `EvalReportCompareService` / `L1SmokeGateService` |
| L1 套件 | `fixtures/harness/eval/suites/lite-smoke-suite.json` | Context Lint strict + plan-verify + on-failure trace 相关 jest |
| CLI | `npm run harness:l1-smoke` | `scripts/replay-cgus-lite.ts` 薄入口 |
| 基线钉扎 | `npm run harness:l1-smoke:baseline` | `HARNESS_EVAL_RECORD_BASELINE=1` 写入 `pathFingerprintBaseline` |

`scripts/lib/harness-run-fingerprint.ts` 已 re-export 至 `src/harness/eval/fingerprint/eval-fingerprint.util.ts`。

架构图：[harness-architecture-map.md §2](./harness-architecture-map.md#2-l1-smoke-数据流26s-指纹门禁)。

## 5. 梯队 3 摘要（待排期）
- **Shadow Grader**：`HARNESS_SHADOW_GRADER=1` + PLAN/VERIFY 异步语义分 → `HarnessShadowMetricsCollector`；不阻塞主链。
- **同步硬门禁**：rubric 稳定后 `HARNESS_KERNEL_HARD=1`（须运维签字）。

## 6. 相关测试

| 文件 | 覆盖 |
|------|------|
| `harness-trace-mode.util.spec.ts` | 三态解析与兼容 `HARNESS_RECORD_TRACE` |
| `harness-trace-recorder.on-failure.spec.ts` | 逆向合成 trace 结构 |
| `decision-kernel.harness-on-failure-trace.spec.ts` | Kernel 成功零 retrofit / 失败落盘 |
| `decision-kernel.finalize-harness-trace.spec.ts` | `full` vs `on-failure` 编排收口 |

## 7. 架构拼图（已补齐）

- **[harness-architecture-map.md](./harness-architecture-map.md)** — Nest 模块依赖、L1 序列图、Trace 状态机、路由 SSOT、环境变量速查、生产 vs CI 配置矩阵。

---

*维护：变更 Trace 语义、Kernel 失败收口或新增 env 时，同步更新 [harness-architecture-map.md](./harness-architecture-map.md) 与 Harness Runtime 本地笔记。*
