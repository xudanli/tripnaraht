---
name: optimization-candidate-search
description: >-
  TripNARA 优化与候选搜索栈：Abu/Dre、CGUS、统一目标函数、概率世界模型与
  期望效用、Negotiate 上下文加载、用户 optimization API、内核侧
  optimization-engine-adapter 与 candidate-search.pipeline 的衔接。
  在用户或任务涉及 CGUS、Abu、候选排序、risk-assessment、world model、
  或 src/trips/decision/optimization 时使用。
---

# 优化与候选搜索工程

**快捷唤起**：在 Agent 中输入 **`/optimize`**（`.cursor/capabilities/optimize/`）；纯 CGUS/MC 可用 **`/cgus`**。

## 说明

**CGUS 深度**（五步、MC 与 `deterministicWorld` 对齐）见独立 Skill：**`cgus-engineering`**。本 Skill 覆盖「优化栈全景」与内核候选管线的交界。

## 建议团队

| 角色 | 职责 | 主要落点 |
|------|------|----------|
| **优化栈负责人** | 模块装配、策略编排 V2、对外 API | `optimization.module.ts`、`strategy-orchestrator*.ts` |
| **候选与 CGUS** | CGUS 搜索、效用先验、MC 预算分配 | `cgus-search.service.ts` → 细节见 **`cgus-engineering`** |
| **显式优化器** | Abu / Dre 与目标函数 | `abu-optimizer.service.ts`、`dre-optimizer.service.ts` |
| **世界上下文** | 协商/风险评估加载 plan+world、坐标与元数据 | `negotiate-context-loader.service.ts`、`optimization-user.controller.ts` |
| **内核衔接** | DSO → `WorldModelContext`、Hints、MetaPolicy 采样 | `optimization-engine-adapter.service.ts`、`candidate-search.pipeline.ts`（kernel） |

## 代码地图

- **Trips 优化域**：`src/trips/decision/optimization/`
- **内核适配**：`src/decision/kernel/optimization-engine-adapter.service.ts`
- **内核候选管线**：`src/decision/kernel/candidate-search.pipeline.ts`
- **脚本**：`scripts/test-optimize-cgus.ts`、`scripts/replay-cgus-suite.ts`、`scripts/test-risk-assessment-trip.ts`

## PR 自检

- [ ] 改权重或维度：MC 路径是否仍传 `deterministicWorld`（见 **`cgus-engineering`**）。
- [ ] 改 `WorldModelContext`：adapter、loader、CGUS 是否同源字段。
- [ ] `optimization`、`cgus-search`、`expected-utility` 相关 spec 与（可选）replay 脚本。

## 相邻主线 Skill

- **CGUS / MC 专精**：`cgus-engineering`
- **内核**：`decision-kernel-engineering`
- **编排**：`orchestration-mainline`
- **回放评测**：`replay-evaluation`
- **角色映射与可复制提示词**：`decision-platform-roles`
