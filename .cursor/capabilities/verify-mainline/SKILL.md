---
name: verify-mainline
description: >-
  TripNARA VERIFY 主线：VerifyExecutor（itinerary.verify、RouteFeasibilityEngine、
  ExperienceAgent 可执行性）、与决策内核 verify/repair 环、编排层「Plan 后必验」
  契约。在用户或任务涉及 verify-executor、itinerary.verify、可行性评估、
  VERIFY 步骤或 repair 触发条件时使用。
---

# VERIFY 主线工程

**快捷唤起**：在 Agent 中输入 **`/verify`**（`.cursor/capabilities/verify/`）。

## 建议团队

| 角色 | 职责 | 主要落点 |
|------|------|----------|
| **VERIFY 负责人** | 聚合顺序、降级策略、与 REPAIR 的衔接 | `verify-executor.service.ts` |
| **可行性引擎** | 路线/疲劳/地形/专家规则聚合 | `src/agent/services/route-feasibility-engine.service.ts` |
| **技能与工具** | `itinerary.verify` 注册与输入输出契约 | `src/skills/` 下 itinerary 相关、executor 内调用 |
| **内核一致** | Kernel 侧 verify–repair 循环与 DSO 补丁 | `decision-kernel.verify-repair-loop.spec.ts`、`decision-kernel.service.ts` |

## 契约（与编排对齐）

- 编排意图：**PLAN_GEN 之后必须执行 VERIFY**（见 `orchestration-mainline` 与 `claude-orchestration-prompts`）。
- **Harness**：若步骤走 Harness Runtime，VERIFY 须绑定冻结证据版本；见 **`harness-runtime`**。

## 代码地图

- `src/agent/execution/verify-executor.service.ts` 与 `verify-executor.service.spec.ts`
- `src/agent/execution/agent-phase-executor.module.ts`
- 内核：`src/decision/kernel/decision-kernel.verify-repair-loop.spec.ts`（行为参考）

## PR 自检

- [ ] 新增校验维度：失败时是否明确 `suggestedAction` / 日志，且不误判为 HARD（除非契约要求）。
- [ ] 与 `Gate` 结论冲突时：优先级与产品语义是否文档化或在代码注释中说明。
- [ ] Executor 单测与（若涉及）内核 verify 环 spec 已更新。

## 相邻主线 Skill

- 编排执行：`orchestration-mainline`
- 决策内核：`decision-kernel-engineering`
- Harness 与证据绑定：`harness-runtime`
- 回放（含 verify 契约）：`replay-evaluation`
- 角色映射与可复制提示词：`decision-platform-roles`
