---
name: decision-kernel-engineering
description: >-
  开发 TripNARA 决策内核（Decision Kernel）：executeResearch/Gate/PlanGen/
  Verify/Optimize/Repair、DSO 与 StateManager、orchestrator-state-mapper、
  各 Engine Adapter、候选搜索 pipeline、元决策预算与 POMDP 桥接。
  在用户或任务涉及 decision-kernel.service、decision/kernel、DSO patch、
  OPTIMIZE、或「Conductor 只调 Kernel」迁移时使用。
---

# 决策内核工程（Decision Kernel）

**快捷唤起**：在 Agent 中输入 **`/kernel`**（`.cursor/capabilities/kernel/`）。

## 建议团队

| 角色 | 职责 | 主要落点 |
|------|------|----------|
| **内核负责人** | `DecisionKernel` 公共 API、阶段语义、与编排层契约 | `decision-kernel.service.ts`、`decision-state.types.ts` |
| **状态与 Patch** | DSO 合并、可写路径、快照与回放一致性 | `state-manager.service.ts`、`*-persistence*`、`orchestrator-state-mapper.ts` |
| **Adapter owner** | 优化/约束/反馈/上下文与世界摘要 | `optimization-engine-adapter`、`constraint-engine-adapter`、`feedback-engine-adapter`、`context-engine-adapter` |
| **候选与搜索** | Kernel 内候选生成/搜索管线（与 trips 优化栈衔接） | `candidate-search.pipeline.ts`、相关 `*.spec.ts` |
| **信念与预算** | Meta budget、POMDP 指标、refinement 阈值 | `meta-decision-budget-*.ts`、`research-belief-pomdp-bridge.ts`、`refinement-thresholds.config.ts` |

## 原则

- **Patch 非整表覆盖**：对 DSO 的写入遵循项目既有 patch 语义；与 Harness 的「只返回 patch」叙事对齐时参见 `harness-runtime`。
- **单测贴近契约**：`decision-kernel.*.spec.ts`、`orchestrator-state-mapper*.spec.ts` 为回归首选。

## 代码地图

- `src/decision/kernel/decision-kernel.service.ts`
- `src/decision/kernel/state-manager.service.ts`
- `src/decision/kernel/dso-to-world-model-converter.ts`、`dso-to-trips-converter.ts`
- `src/decision/kernel/candidate-search.pipeline.ts`
- `src/decision/kernel/index.ts`（导出与边界）

## PR 自检

- [ ] 新阶段或改 execute*：编排层与 `KERNEL_NATIVE_EXECUTION` 双路径是否仍一致。
- [ ] 改 DSO 形状：`orchestrator-state-mapper`、持久化与 **replay** 是否同步（见 `replay-evaluation`）。
- [ ] 改 OPTIMIZE：`optimization-candidate-search` / `cgus-engineering` 与 adapter 是否一致。

## 相邻主线 Skill

- 编排执行：`orchestration-mainline`
- 优化与候选搜索：`optimization-candidate-search`、`cgus-engineering`
- VERIFY：`verify-mainline`
- 回放与评估：`replay-evaluation`
- Harness 步骤与 trace：`harness-runtime`
- 角色映射与可复制提示词：`decision-platform-roles`
