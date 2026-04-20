---
name: tripnara-org-capability-system
description: >-
  TripNARA 组织与能力体系：Team→Role→SubAgent→Skill→Kernel/Domain/RAG 分层、
  六大团队与职责边界、标准 Pipeline 与 Skill 分类。用于对齐「决策计算系统」
  认知、拆任务选 Consult 角色、或检查是否违反「决策权集中 / Skill 为执行单位」。
  与 decision-platform-roles、orchestration-mainline、decision-kernel-engineering
  等配合使用；权威长文在 .claude/roles/tripnara-org-capability-system.md。
---

# TripNARA 组织与能力体系（Cursor Skill）

**快捷唤起**：在 Agent 中输入 **`/org`**（见 **`.cursor/skills/README.md`** 与 **`.cursor/STRUCTURE.md`**）。

## 权威全文（Claude roles）

**[`.claude/roles/tripnara-org-capability-system.md`](../../../.claude/roles/tripnara-org-capability-system.md)** — 六团队、SubAgent、Skill 命名契约、Pipeline、职责红线、最小团队表。

## 三层原则（执行前自检）

1. **Team ≠ Role**：Team = 交付责任；Role = 评审与决策视角（`.claude/roles/*.md` + manifest）。  
2. **Skill = 执行单位**：编排层拼流程，业务可重复逻辑进 `src/skills/`（或 Kernel/Domain 服务由 Skill 调用）。  
3. **决策权集中在 Decision Layer**：不在纯 prompt、不在 Domain「最终排序」、不在 RAG「选方案」。

## 六团队 → 常用 Cursor Skill（干活时开）

| Team | 优先打开的 Skill |
|------|-------------------|
| Decision Design | 策略/DSL 与产品口径：配合 **`.cursor/capabilities/decision-kernel-engineering/`**、`chief_product_architect` 角色文 |
| Agent & Orchestration | **`.cursor/capabilities/orchestration-mainline/`**、**`harness-runtime/`** |
| Decision & Optimization | **`decision-kernel-engineering/`**、**`cgus-engineering/`** / **`optimization-candidate-search/`** |
| Travel Domain | **`optimization-candidate-search/`**（候选/世界模型交界）、各领域代码 |
| RAG & Data | **`rag-engineering/`** |
| Platform | **`harness-runtime/`**、**`replay-evaluation/`**、**`reinforcement-learning/`**（RL/发布链） |

## 标准 Pipeline（与实现对齐）

`INTAKE → RESEARCH → GATE → PLAN → OPTIMIZE → VERIFY → REPAIR? → NARRATE → DONE`

细则与 Gate-first、VERIFY 契约见 **`.cursor/capabilities/orchestration-mainline/SKILL.md`**、**`.cursor/capabilities/verify-mainline/SKILL.md`**。

## 相关 Skill 包

| 包 | 用途 |
|----|------|
| [`decision-platform-roles`](../decision-platform-roles/SKILL.md) | `/team`：role-router、工程小队提示词、change_areas（与本包同层 **`.cursor/org/`**） |
| [`five-teams-decision-vs-execution`](../../../.claude/roles/five-teams-decision-vs-execution.md) | 「决策队 / 干活队」简视图 |

## 对内一句话

**TripNARA = 用 Skill 连接世界，用 Agent 编排流程，用 Kernel 计算决策，用 Strategy 定义「什么是好」。**
