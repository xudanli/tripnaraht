# 工程主线 ↔ role-router ↔ manifest 映射

## 1. 工程主线 Cursor Skill → 建议 `change_areas`（提交 PR 时在 role-router 输入里勾选）

| 工程主线 Skill | 典型 `change_areas`（可多选） |
|----------------|------------------------------|
| `orchestration-mainline` | `claude_exec_or_state_machine`，常辅以 `skill_contract_or_new_skill` |
| `decision-kernel-engineering` | `claude_exec_or_state_machine`，若动日志/回放加 `decision_log_or_replay`；若动 OPTIMIZE 加 `optimization_or_cgus_candidates` |
| `optimization-candidate-search` / `cgus-engineering` | `optimization_or_cgus_candidates` |
| `verify-mainline` | `gate_policy_or_risk_disclosure`，常辅以 `skill_contract_or_new_skill` |
| `replay-evaluation` | `decision_log_or_replay`，若动指标/奖励加 `trajectory_reward_or_metrics` |
| `harness-runtime` | `claude_exec_or_state_machine` + `decision_log_or_replay` +（若动 skill 注册）`skill_contract_or_new_skill` |
| `reinforcement-learning` | **`trajectory_reward_or_metrics`**（必选）；常叠加 **`decision_log_or_replay`**、**`deployment_or_observability`** |
| `rag-engineering` | **`rag_index_or_chunking`**；质量/评测协同时加 **`rag_quality`**（`task_tags`）或 **`trajectory_reward_or_metrics`** |

完整可选值定义见 `.claude/role-router.json` → `inputs.change_areas`。

## 2. `change_areas` → role-router 默认 `include_roles`（节选）

| `change_areas` | `include_roles`（来自 `role-router.json`） |
|----------------|--------------------------------------------|
| `claude_exec_or_state_machine` | `architect`, `ai_reasoning_system_architect`, `skills_engineer` |
| `gate_policy_or_risk_disclosure` | `decision_safety_compliance_officer`, `ai_reasoning_system_architect`, `chief_product_architect` |
| `decision_log_or_replay` | `ai_reasoning_system_architect`, `decision_evaluation_evolution_lead`, `chief_data_engineer` |
| `optimization_or_cgus_candidates` | `chief_optimization_scientist`, `architect`, `chief_product_architect` |
| `skill_contract_or_new_skill` | `skills_engineer`, `architect` |
| `rag_index_or_chunking` | `rag_engineer`, `rag_content_manager`（提示词：`.claude/roles/rag-engineer.md`、`rag-content-manager.md`） |

命中多条规则时：**合并 `include_roles` 去重**（见 `role-router.md`）。

## 3. 工程小队角色（Skill 表）→ 建议 Consult 的 manifest `id`

工程小队名称见各主线 Skill 内表格；与组织侧 Claude 角色**不是 1:1**，按下表做 **Consult**（读对应 `.claude/roles/*.md`）。

| 工程小队（概括） | 建议 Consult（manifest `id`） |
|------------------|--------------------------------|
| 编排负责人、入口与运行壳 | `ai_reasoning_system_architect`, `architect`, `skills_engineer` |
| Phase Executor 集成 | `ai_reasoning_system_architect`, `architect` |
| 内核负责人、状态与 Patch | `architect`, `ai_reasoning_system_architect` |
| Kernel Adapters | `architect`, `chief_optimization_scientist`（若涉优化 hints） |
| 优化栈 / CGUS / 概率效用 | `chief_optimization_scientist`, `architect`, `chief_product_architect` |
| VERIFY / 可行性 / Gate 口径 | `decision_safety_compliance_officer`, `ai_reasoning_system_architect`, `skills_engineer` |
| 回放 / golden / 契约 | `decision_evaluation_evolution_lead`, `chief_data_engineer`, `ai_reasoning_system_architect` |
| Harness 步骤与 trace | `architect`, `ai_reasoning_system_architect`, `skills_engineer` |
| RL / 轨迹 / Reward / ROLL | `decision_evaluation_evolution_lead`, `chief_data_engineer`；发布链另读 **`.claude/roles/rl-infra/*.md`** 与 **`reinforcement-learning`** Skill |
| RAG / Chunk / 索引 | **`rag_engineer`、`rag_content_manager`**（已入 `role-skill-manifest.json`；长文 **`.claude/roles/rag-*.md`**，工程地图 **`rag-engineering`** Skill） |

每个 `id` 的 **`prompt` 路径、`default_paths`、`checklist`** 见 `.claude/role-skill-manifest.json` → `roles[]`。

## 4. manifest 角色 → 提示词文件

| `id` | 提示词文件（仓库内） |
|------|----------------------|
| `architect` | `.claude/roles/architect.md` |
| `skills_engineer` | `.claude/roles/skills-engineer.md` |
| `ai_reasoning_system_architect` | `.claude/roles/ai-reasoning-system-architect.md` |
| `decision_safety_compliance_officer` | `.claude/roles/decision-safety-compliance-officer.md` |
| `chief_product_architect` | `.claude/roles/chief-product-architect.md` |
| `chief_optimization_scientist` | `.claude/roles/chief-optimization-scientist.md` |
| `decision_evaluation_evolution_lead` | `.claude/roles/decision-evaluation-evolution-lead.md` |
| `chief_data_engineer` | `.claude/roles/chief-data-engineer.md` |
| `decision_ux_architect` | `.claude/roles/decision-ux-architect.md` |
| `devops_engineer` | `.claude/roles/devops-engineer.md` |
| `rag_engineer` | `.claude/roles/rag-engineer.md` |
| `rag_content_manager` | `.claude/roles/rag-content-manager.md` |

其他在 manifest 中出现但未列出的 `id`，以 `role-skill-manifest.json` 内 `prompt` 字段为准。

## 5. Manifest 全量「三句版」提示词

各 `id` 一段可复制开场白：**[prompts-manifest-roles-short.md](prompts-manifest-roles-short.md)**。

## 6. 三条硬规则（摘自 `role-router.md`）

1. 发布主链 R/A 以 `scripts/rl-infra/roll/RACI_WEEK1_3.md` 为准；router 只建议 Consulted/Informed。
2. 动 `claude_exec_or_state_machine` → 必须拉 `architect` 与 `ai_reasoning_system_architect`。
3. 动 `gate_policy_or_risk_disclosure` → 必须拉 `decision_safety_compliance_officer`。
