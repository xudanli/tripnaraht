---
name: orchestration-mainline
description: >-
  编排与执行 TripNARA Agent 主线：Conductor 状态机、INTAKE/RESEARCH/POI_SELECTION/
  PLAN_GEN/VERIFY/REPAIR/NARRATE 顺序、KERNEL_NATIVE_EXECUTION 下 Kernel 与
  Phase Executor 的衔接、routeAndRun 与 TripRun。在用户或任务涉及
  claude-orchestrator、agent.service、agent/execution、编排顺序、
  或「Gate 在 Plan 前 / Verify 在 Plan 后」契约时使用。
---

# 编排执行主线（Agent Orchestration）

**快捷唤起**：在 Agent 中输入 **`/orchestration`**（`.cursor/capabilities/orchestration/`）。

## 说明

本仓库**未**预置按产品线的固定编制；下列为**建议小队**（可兼职），覆盖编排与执行闭环。

| 角色 | 职责 | 主要落点 |
|------|------|----------|
| **编排负责人** | 状态机步骤顺序、缺口与澄清早退、与 DSO 同步时机 | `claude-orchestrator.service.ts`、`claude-orchestration-prompts.ts` |
| **Phase Executor 集成** | `KERNEL_NATIVE_EXECUTION` 开关、Kernel↔Executor 边界 | `agent/execution/README.md`、`agent-phase-executor.module.ts`、`decision/kernel/interfaces/phase-executor.interface.ts` |
| **入口与运行壳** | `routeAndRun`、deadline、TripRun、稳定化层 | `agent.service.ts` |
| **子 Agent 契约** | Planner / Gatekeeper / Narrator 与步骤的输入输出 | `agent/services/*`、`gatekeeper-agent.service.ts` 等 |

## 硬性契约（评审必查）

- **Gate 在 Plan 前**：`GATE_EVAL` 未通过或未产出 `gateResult` 时不得进入 `PLAN_GEN`（与 `EXECUTION_PLANNING_PROMPT` 一致）。
- **Verify 在 Plan 后**：`PLAN_GEN` 之后必须能进入 `VERIFY`（具体由状态机与内核标志控制；见 `verify-mainline`）。
- **Kernel 原生路径**：`KERNEL_NATIVE_EXECUTION=true` 时业务下沉 `DecisionKernel` + Phase Executor，编排层只做调度与异常恢复；见 `src/agent/execution/README.md`。

## 代码地图

- `src/agent/services/claude-orchestrator.service.ts` — 主状态机。
- `src/agent/execution/` — `research-executor`、`gate-eval-executor`、`plan-gen-executor`、`verify-executor`、`repair-executor`。
- `src/agent/plan-execute/orchestrator.service.ts` — 若任务涉及 Plan-Execute 子编排。

## PR 自检

- [ ] 新步骤或重排：是否破坏 Gate/Verify 顺序或与 Harness 步骤契约冲突（见 `harness-runtime`）。
- [ ] 改 `KERNEL_NATIVE_EXECUTION` 分支：双路径（true/false）是否仍有对称行为或显式降级说明。
- [ ] 相关 `execution` / orchestrator `*.spec.ts` 已更新。

## 相邻主线 Skill

- 决策内核：`decision-kernel-engineering`
- VERIFY：`verify-mainline`
- 优化与搜索：`optimization-candidate-search`（及 `cgus-engineering`）
- 回放与评估：`replay-evaluation`
- 角色映射与可复制提示词：`decision-platform-roles`
