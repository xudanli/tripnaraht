# TripNARA / ROLL 能力地图

## 1. 文档目标

本文件用于统一说明三层能力：

1) 开发侧可用技能（工程提效能力）  
2) 项目专家角色能力（研发生命周期能力）  
3) 面向用户的产品能力（对外价值能力）

适用场景：

- 新成员 onboarding
- 发布评审前能力边界核对
- 需求评估时快速定位 owner / 代码锚点

---

## 2. 开发侧可用技能（Agent/工程提效）

| 技能 | 主要作用 | 典型使用场景 |
|---|---|---|
| `openai-docs` | 官方文档检索、模型选型、升级建议 | 需要官方依据的技术决策 |
| `plugin-creator` | 创建插件脚手架 | 新建本地工具/插件扩展 |
| `skill-creator`（system） | 创建/更新 Codex Skill | 提炼可复用的工作流能力 |
| `skill-installer` | 安装技能（curated/GitHub） | 快速引入外部能力 |
| `create-rule` | 创建 Cursor 规则 | 团队规范、代码约束固化 |
| `create-skill`（cursor） | Cursor 场景 Skill 编写 | 项目内定制自动化能力 |
| `update-cursor-settings` | 编辑器设置治理 | 统一格式化、编码体验 |

---

## 3. 项目专家角色能力（研发侧）

### 3.1 核心常驻角色（建议）

| 角色 | 核心职责 | 关键锚点 |
|---|---|---|
| Backend/Infra Engineer | 编排接入、运行时契约、可观测、熔断限流 | `.claude/roles/rl-infra/backend-infra-engineer.md` |
| RL/ML Platform Engineer | 训练流水线、模型注册、在线服务 | `.claude/roles/rl-infra/rl-ml-platform-engineer.md` |
| SRE / Safety-Operations | guardrails、canary、回滚、告警链路 | `scripts/rl-infra/roll/*.yml`、`CI_CD_INTEGRATION.md` |
| Evaluation Engineer | 离线评测、回归门槛、上线 gate | `.claude/roles/rl-infra/evaluation-engineer.md` |
| PM（RL产品） | KPI、灰度节奏、Go/No-Go 拍板 | `.claude/roles/rl-infra/pm-rl-product.md` |
| Data Engineer（Trajectory） | 轨迹ETL、数据质量、脱敏、版本化 | `.claude/roles/rl-infra/data-engineer-trajectory.md` |

### 3.2 按需专家角色（触发式）

| 角色 | 介入触发条件 | 关键锚点 |
|---|---|---|
| UX Writer | 用户可见风险提示/审批语义/解释结构变更 | `.claude/roles/rl-infra/ux-writer.md`、`RACI_WEEK1_3.md` |
| Domain Expert Network | 高风险目的地/季节规则更新、反例库补充 | `.claude/roles/rl-infra/domain-expert-network.md` |
| LLM Judge / RM Engineer | 质量评分争议、reward 偏移、模型投机风险 | `.claude/roles/rl-infra/llm-judge-rm-engineer.md` |

---

## 4. 面向用户的产品能力（对外）

| 用户能力 | 能力说明 | 关键代码/API |
|---|---|---|
| 决策优先规划 | 先判定路线是否应存在，再生成方案 | `src/agent/services/agent.service.ts` |
| Should-Exist Gate | 输出 `ALLOW/BLOCK/ADJUST_REQUIRED/NEED_USER_CONFIRM` | `src/agent/services/sub-agents/gatekeeper-agent.service.ts` |
| 可执行行程 | 输出结构化 itinerary，非纯文本建议 | `src/agent/interfaces/trip-plan.interface.ts` |
| 风险与约束校验 | 安全、可达性、疲劳、合规检查 | `src/trips/readiness/services/*` |
| 替代方案修复 | 风险触发后给出可落地替代路径 | `LocalInsight` 相关服务与修复步骤 |
| 决策解释与证据链 | 给出“为什么这么决策”的可追溯解释 | `decision_log` / `evidence_refs` 数据结构 |
| 反馈闭环 | 用户采纳/编辑/拒绝反馈进入训练改进 | `src/agent/training/services/reward-signal-extractor.service.ts` |

---

## 5. 发布治理能力（Week1-3）

| 能力 | 产物/流程 | 关键文档 |
|---|---|---|
| Staging 严格门禁 | `staging-fast-gate` + `staging-strict-gate` | `CI_CD_INTEGRATION.md` |
| Prod 守门与放量 | `prod-fast-gate` + `prod-strict-gate` + ramp gate | `CI_CD_INTEGRATION.md` |
| Canary 与回滚 | canary rollout / rollback / auto-rollback | `canary-rollout.sh`、`canary-rollback.sh` |
| 就绪度与健康分 | readiness-check / release-health-score | `verify-week1-3-readiness.sh`、`generate-release-health-score.sh` |
| 责任与审批 | RACI + DRI/Backup + Go/No-Go | `RACI_WEEK1_3.md`、`WEEK1_STEERING_ONE_PAGER.md` |

---

## 6. 责任边界速记（重要）

- UX 默认不承担发布主链 R/A，仅在用户可见语义变更时以 C 介入。  
- 纯后端稳定性、性能、观测、阈值治理变更，不要求 UX 进入主链。  
- Go/No-Go 以 `RACI_WEEK1_3.md` 为责任基准，以周会 one-pager 为执行节奏基准。

---

## 7. 参考入口

- `scripts/rl-infra/roll/RACI_WEEK1_3.md`
- `scripts/rl-infra/roll/WEEK1_STEERING_ONE_PAGER.md`
- `scripts/rl-infra/roll/CI_CD_INTEGRATION.md`
- `.claude/roles/rl-infra/README.md`
