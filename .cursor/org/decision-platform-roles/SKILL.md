---
name: decision-platform-roles
description: >-
  TripNARA 决策平台「工程主线 ↔ Claude role-router ↔ 小队角色」映射表，
  以及工程小队（编排/内核/优化/VERIFY/回放/RL/RAG）可复制的系统提示词片段。
  在组建 squad、对齐 RACI、为子代理写 system prompt、或从
  change_areas 反查应 Consult 的 manifest 角色时使用。
---

# 决策平台角色与提示词

## 决策队 vs 干活队（五大团队拆解）

「五队」在工程上拆成两条链，避免平行功能组互相越位：

| 链 | 包含（原五队中的） | 职责一句话 |
|----|-------------------|------------|
| **决策队** | Decision Design；Decision & Opt；Harness / Utility 门禁所要求的证据链 | 定义好坏、求最优、用基线证明可合入 |
| **干活队** | RAG & Data Infra；Travel Domain；Agent & Orchestr（执行壳） | 情报与索引、资源 API 与校验、流水线与上下文 |

**Claude 组织侧全文**（五队表、三条红线、与 `manifest` Consult 映射）：**[`.claude/roles/five-teams-decision-vs-execution.md`](../../../.claude/roles/five-teams-decision-vs-execution.md)**。

**Cursor 侧按活选 Skill**（与上表对应）：

| 决策队常开 Skill | 干活队常开 Skill |
|------------------|-------------------|
| **`.cursor/capabilities/`** 下：`decision-kernel-engineering`、`cgus-engineering` 或 `optimization-candidate-search`、`verify-mainline`、`replay-evaluation` | 同目录：`orchestration-mainline`、`harness-runtime`、`rag-engineering`；动 `src/skills/` 契约时叠加本包内工程小队提示词 |

产品/仓库根 `docs/` **不强制**再放同主题长文；以 **`.claude/roles/*.md` + 本 Skill** 为单一协作源即可。

## 快速使用

1. **选主线**：打开对应 Cursor Skill（`orchestration-mainline`、`decision-kernel-engineering` 等）。
2. **选工程小队提示词**：复制 [prompts-engineering-squads.md](prompts-engineering-squads.md) 中对应角色的 `###` 下代码块到自定义说明 / 子代理 system prompt。
3. **选组织侧 Claude 角色**：按任务改动的 `change_areas` 查 [reference-role-mapping.md](reference-role-mapping.md)，再读 `.claude/role-skill-manifest.json` 中 `prompt` 指向的 `.claude/roles/*.md`。

## Agent 快捷唤起（Cursor `/`）

在 Agent 输入 **`/team`** 可显式挂载本包（见仓库 **`.cursor/skills/README.md`** 与 **`.cursor/STRUCTURE.md`** 一览：`/cgus`、`/kernel`、`/harness`、`/rl`、`/rag` 等 → 对应 **capabilities** 短入口）。

## 文件索引

| 文件 | 内容 |
|------|------|
| [`.cursor/STRUCTURE.md`](../../STRUCTURE.md) | **`.cursor/` 四层**：原子 `skills/` · `pipelines/` · `capabilities/` · `org/` + `.claude/roles/` |
| [`.claude/roles/five-teams-decision-vs-execution.md`](../../../.claude/roles/five-teams-decision-vs-execution.md) | 五大团队 → **决策队 / 干活队**、三条红线、Consult 映射 |
| [reference-role-mapping.md](reference-role-mapping.md) | 主线 ↔ `change_areas` ↔ `include_roles` ↔ manifest `id` |
| [prompts-engineering-squads.md](prompts-engineering-squads.md) | 工程小队角色中文系统提示词（可复制） |
| [prompts-manifest-roles-short.md](prompts-manifest-roles-short.md) | **manifest 全部 `id`** 各一段「三句版」快捷提示词（子代理开场） |
| [../../capabilities/reinforcement-learning/prompts-rl-squads.md](../../capabilities/reinforcement-learning/prompts-rl-squads.md) | **RL 基础设施小队**可复制 System 开场（MLP/SRE/EVAL/DATA/Judge 等） |
| [../../capabilities/rag-engineering/prompts-rag-squads.md](../../capabilities/rag-engineering/prompts-rag-squads.md) | **RAG 小队**可复制 System 开场（Engineer / Content Manager） |

## 与 role-router 协议

任务输入格式与三步法见 `.claude/role-router.md`；规则表见 `.claude/role-router.json`。
