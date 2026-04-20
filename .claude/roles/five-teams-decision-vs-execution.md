# 五大团队：决策队 vs 干活队（价值加工链）

> **完整六团队 + Team→Role→SubAgent→Skill 链**：见 **[`tripnara-org-capability-system.md`](tripnara-org-capability-system.md)**（本目录）；Cursor 入口 **`.cursor/org/tripnara-org-capability-system/SKILL.md`**，快捷 **`/org`**。

本文档给 **Claude 侧协作角色**用：把「五队」拆成两条链——**谁定义与裁决好坏**，**谁采集事实并执行**——避免与 `src/skills/` 运行时 Skill 混淆。

- **工程实现地图**：Cursor → `.cursor/org/decision-platform-roles/SKILL.md`（含与本页对齐的 Cursor Skill 表）。  
- **角色清单与流程**：`muti_agent_collaboration.md`。

---

## 1. 为什么要拆成「决策」和「干活」

| 类型 | 回答的问题 | 典型产出形态 |
|------|------------|----------------|
| **决策队** | 好坏如何定义？最优如何求？合入如何证？ | 策略/权重/约束 schema、目标函数与搜索、基线与 Utility 门禁 |
| **干活队** | 事实从哪来？资源 API 是否准？流水线怎么跑？ | 索引与融合、领域 API 与校验、编排/上下文/Harness 壳 |

**原则**：数值型业务红线、排序效用、门控语义 → **决策队**；Prompt 与领域模块**不承载立法**。

---

## 2. 五队归属：决策队 / 干活队

### 决策队（立法 + 求解 + 合入证据）

| 原「五队」名 | 隐喻 | 核心交付物 | 与 manifest 角色的 Consult 关系（非独占） |
|--------------|------|------------|---------------------------------------------|
| **Decision Design** ⭐ | 立法者 | Strategy JSON、Utility Weights、Constraint DSL | `chief_product_architect`、`decision_safety_compliance_officer`、`architect` |
| **Decision & Opt** | 精算师 | CGUS、DSO、Monte Carlo | `chief_optimization_scientist`、`architect`、`ai_reasoning_system_architect` |
| **Harness / Benchmark（门禁侧）** | 验收 | Utility 对比、回放基线、合入门槛定义 | `decision_evaluation_evolution_lead`、`chief_data_engineer`、`architect` |

> 说明：你原文里的「Agent & Orchestr」**执行壳**归**干活队**（见下）；**Harness 所代表的 Utility 证据链**归**决策队**，避免「跑通了就算」无度量。

### 干活队（情报 + 资源 + 调度执行）

| 原「五队」名 | 隐喻 | 核心交付物 | 与 manifest 角色的 Consult 关系（非独占） |
|--------------|------|------------|---------------------------------------------|
| **RAG & Data Infra** | 图书馆 | Vector Index、Data Fusion、索引脚本 | `rag_engineer`、`rag_content_manager`、`chief_data_engineer` |
| **Travel Domain** | 供应商 | Resource APIs、Schema、校验 | 领域专家网络见 `rl-infra/domain-expert-network.md`；实现侧常 Consult `architect` + 对应域 |
| **Agent & Orchestr** | 总调度 | Task Pipelines、Context Builder、阶段机与 Skill 调用 | `ai_reasoning_system_architect`、`skills_engineer`、`architect` |

---

## 3. 三条红线（协作时自检）

1. **Prompt 禁令**：`src/agent/` 侧 Prompt **不写死**数值型业务约束；阈值进 `planning-policy` / 配置或 DSL，由**决策队**拥有语义。  
2. **Domain 纯净化**：`places/`、`hotels/` 等以数据与校验为主；**推荐排序的效用**上收到决策/优化层。  
3. **Harness 唯一性**：主链决策相关改动须带 **Utility / 回放**证据；回退须显式豁免，由**决策队**口径认可。

---

## 4. 与工程主线的对应（便于路由任务）

| 决策队关注点 | 优先打开的 Cursor **capability**（`.cursor/capabilities/`） |
|--------------|-------------------------|
| 内核、状态、门控与适配器 | `decision-kernel-engineering/` |
| CGUS、候选、概率效用 | `cgus-engineering/`、`optimization-candidate-search/` |
| VERIFY、风险披露 | `verify-mainline/` |
| 回放、golden、契约 | `replay-evaluation/` |

| 干活队关注点 | 优先打开的 Cursor **capability** |
|--------------|-------------------------|
| Conductor、Phase、与 Kernel 接线 | `orchestration-mainline/` |
| Harness 运行时与 trace | `harness-runtime/` |
| RAG、chunk、索引 | `rag-engineering/` |
| Skill 契约与注册 | `src/skills/` + manifest **`skills_engineer`** |

具体 `change_areas` / `include_roles` 仍按 `.claude/role-router.json` 与 **`.cursor/org/decision-platform-roles/reference-role-mapping.md`** 执行。
