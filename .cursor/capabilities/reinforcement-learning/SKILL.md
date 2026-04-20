---
name: reinforcement-learning
description: >-
  TripNARA 强化学习与 RL 基础设施：ROLL 发布链（gate/canary/ramp）、
  scripts/rl-infra 与 roll 脚本、Nest training 域（轨迹/Reward/评测/ROLL 适配）、
  Harness 轨迹导出与决策日志中的 RLHF 埋点。在用户或任务涉及 trajectory、
  reward、LLM judge、policy worker、Ray/bridge、LoRA 微调、rollout 指标、
  RACI_WEEK1_3 或 src/agent/training 时使用。
---

# 强化学习与 RL 基础设施（TripNARA）

**快捷唤起**：在 Agent 中输入 **`/rl`**（`.cursor/capabilities/rl/`）。

## 建议团队（与仓库文档对齐）

核心发布链 RACI 见 **`scripts/rl-infra/roll/RACI_WEEK1_3.md`**。角色长提示词见 **`.claude/roles/rl-infra/*.md`**；工程小队可复制句见同目录 **[prompts-rl-squads.md](prompts-rl-squads.md)**。

| 角色（缩写见 RACI） | 职责 | 主要落点 |
|--------------------|------|----------|
| **RL/ML Platform（MLP）** | bridge/worker、Ray、训练/推理编排、ROLL 服务稳定性 | `scripts/rl-infra/roll/`、`policy_worker.py`、`bridge_service.py`、`rl-ml-platform-engineer.md` |
| **Backend/Infra（BE）** | Orchestrator 接入、契约、Compose/K8s、CI 门禁 | `roll/docker-compose*.yml`、`roll/k8s/`、`backend-infra-engineer.md` |
| **SRE / 发布 Owner** | staging/prod gate、canary、回滚、readiness | `canary-rollback.sh`、`verify-*-guardrails.sh`、`RACI_WEEK1_3.md` |
| **Evaluation（EVAL）** | release health、burn-in、A/B uplift、指标协议 | `generate-release-health-score.sh`、`evaluation-engineer.md` |
| **Trajectory Data（DATA）** | 轨迹采集、ETL、血缘与合规 | `src/agent/training/services/trajectory-*.ts`、`data-engineer-trajectory.md` |
| **LLM Judge / RM** | Reward 信号、Judge 服务、提示与版本 | `python/judge/`、`llm-judge-rm-engineer.md`、`reward-signal-extractor.service.ts` |
| **PM（RL 产品）** | 范围、阈值治理、Go/No-Go | `pm-rl-product.md`、`WEEK1_STEERING_ONE_PAGER.md` |
| **Safety/Compliance** | 红队、审计、合规闸 | `safety-compliance-lead.md`、`compliance-audit.service.ts` |

## 代码与文档地图

1. **ROLL 与脚本**：`scripts/rl-infra/README.md`、`scripts/rl-infra/roll/README.md`、`scripts/rl-infra/roll/ARCHITECTURE.md`
2. **新训练栈（推荐）**：`docs/LORA_FINETUNE_GUIDE.md`、`docker/` 下 train compose、`python/train/`、`python/judge/`
3. **Nest 训练域**：`src/agent/training/`（轨迹、Reward、ROLL 客户端、评测门、MLflow/vLLM 客户端）
4. **决策侧与轨迹**：`decision-state.types.ts` 中 RLHF/Δ 摘要字段、`src/harness/exporters/harness-trajectory-exporter.service.ts`
5. **角色与 RACI**：`.claude/roles/rl-infra/README.md`、`scripts/rl-infra/roll/RACI_WEEK1_3.md`

## role-router 协作

- 改动 **Reward/指标/轨迹协议**：`change_areas` 含 **`trajectory_reward_or_metrics`** → 拉 `decision_evaluation_evolution_lead`、`chief_data_engineer`（见 `.claude/role-router.json`）。
- 与 **决策回放 / 日志** 同 PR 时：加 **`decision_log_or_replay`**。

## PR 自检

- [ ] Reward 或指标语义变更：是否有**版本号/文档**与可执行回归（对齐 `decision_evaluation_evolution_lead` checklist）。
- [ ] 发布/阈值/门禁脚本：是否对照 **RACI** 更新 R/A 与 `verify-*.sh`。
- [ ] 新轨迹字段：Prisma/存储与 **Harness 导出**、**replay** 是否同步。

## 相邻 Skill

- 回放与评估：`replay-evaluation`
- Harness：`harness-runtime`
- RAG / 知识检索：`rag-engineering`（快捷 **`/rag`**）
- 决策平台角色：`decision-platform-roles`
- 快捷唤起：**`/rl`**（`.cursor/capabilities/rl/`）
