# RL Fully Online Week1-3 RACI（中文版）

## 1) 文档目的

本文件是 Week1-3 上线阶段的统一责任基线，覆盖如下关键流：

- staging gate
- production guardrail
- canary 发布/回滚
- ramp gate
- readiness 检查

目标：

- 明确每条关键流的**执行责任人**与**最终拍板人**。
- 降低发布协作歧义与跨团队扯皮风险。
- 标准化 Go/No-Go 决策流程与值班备援要求。

---

## 2) 角色映射

本文使用以下角色缩写：

- **PM**：产品负责人 / RL 产品 Owner
- **BE**：后端 / 基础设施工程师
- **MLP**：RL/ML 平台工程师
- **SRE**：稳定性与运行保障负责人
- **EVAL**：评测工程师
- **DATA**：轨迹数据工程师
- **UX**：UX Writer / 交互设计
- **DEX**：领域专家网络 / 地理顾问（按需介入）

RACI 定义：

- **R** = Responsible（负责执行）
- **A** = Accountable（最终负责与拍板，仅 1 个）
- **C** = Consulted（需要双向协作评审）
- **I** = Informed（需要被同步）

### UX 介入边界（发布链路约束）

默认情况下，UX **不进入** Week1-3 发布主链（不承担 R/A）。  
仅在以下触发条件满足时，UX 以 **C（Consulted）** 角色介入：

1. 新增/修改用户可见风险提示、阻断原因或告警文案语义  
2. 新增/修改审批确认语义（如 `NEED_USER_CONFIRM` 分类/说明）  
3. 决策解释字段结构发生变化，影响用户理解

若本次发布仅涉及后端稳定性、性能、观测、阈值治理，UX 保持 **I** 即可。

---

## 3) Week1-3 核心流 RACI

| 流程 / 产物 | R | A | C | I |
|---|---|---|---|---|
| `roll-staging-gate.yml` + `verify-staging-no-simulation.sh` | BE | SRE | MLP, EVAL | PM |
| `roll-prod-guardrails-gate.yml` + `verify-prod-guardrails.sh` | SRE | SRE | BE, MLP | PM, EVAL |
| `roll-staging-burnin.yml` + `run-staging-burnin.sh` + `generate-burnin-report.sh` | MLP | SRE | EVAL, DATA | PM |
| `roll-canary-release.yml` + `canary-rollout.sh` | SRE | SRE | BE, MLP | PM, EVAL |
| `canary-rollback.sh` + `roll-auto-rollback.yml` | SRE | SRE | BE, MLP | PM |
| `roll-prod-ramp-gate.yml` + `verify-prod-ramp-thresholds.sh` + `resolve-ramp-threshold-profile.sh` | SRE | PM | EVAL, BE | MLP |
| `roll-release-health-score.yml` + `generate-release-health-score.sh` | EVAL | PM | SRE, DATA | 全员 |
| `roll-readiness-check.yml` + `verify-week1-3-readiness.sh` | EVAL | PM | SRE, BE, MLP | 全员 |
| `CI_CD_INTEGRATION.md` 维护 | BE | PM | SRE, MLP, EVAL | 全员 |
| `WEEK1_STEERING_ONE_PAGER.md` 维护 | PM | PM | SRE, BE, MLP, EVAL | 全员 |

注：
- 当且仅当触发“UX 介入边界”中的条件时，相关流可将 UX 临时加入 **C**。
- 不触发条件时，维持当前表格，不额外增加 UX 协作负担。

---

## 4) 当前仓库文件级直接归属

| 文件 | R | A | C | I |
|---|---|---|---|---|
| `scripts/rl-infra/roll/canary-rollback.sh` | SRE | SRE | BE, MLP | PM |
| `scripts/rl-infra/roll/docker-compose.yml` | MLP | BE | SRE | PM, EVAL |
| `scripts/rl-infra/roll/WEEK1_STEERING_ONE_PAGER.md` | PM | PM | SRE, BE, MLP | 全员 |
| `scripts/rl-infra/roll/CI_CD_INTEGRATION.md` | BE | PM | SRE, MLP, EVAL | 全员 |

---

## 5) Go/No-Go 决策协议

### 5.1 技术门禁（必须全部通过）

- `staging-fast-gate`
- `staging-strict-gate`
- `prod-fast-gate`
- `prod-strict-gate`
- `roll-readiness-check`

### 5.2 业务门禁（必须满足）

- `WEEK1_STEERING_ONE_PAGER.md` 中 KPI 阈值已确认
- 最新 `release-health-score` 达到发布阈值

### 5.3 最终审批链

- **A（最终拍板）= PM**
- **C（技术签字）= SRE + EVAL**
- **R（执行发布）= SRE**

若任一强制门禁失败，发布状态自动为 **No-Go**，必须修复并重跑通过后才可继续。

---

## 6) DRI 与备援模板（发布前必须填写）

请在发布评审前补全真实人名与时间窗。

| 流程 | DRI | Backup DRI | On-Call 时间窗 | 升级路径 |
|---|---|---|---|---|
| Staging 严格门禁 | `<name>` | `<name>` | `<time>` | `<path>` |
| Prod Guardrails 门禁 | `<name>` | `<name>` | `<time>` | `<path>` |
| Burn-in 执行 | `<name>` | `<name>` | `<time>` | `<path>` |
| Canary 放量 | `<name>` | `<name>` | `<time>` | `<path>` |
| 自动/手动回滚 | `<name>` | `<name>` | `<time>` | `<path>` |
| Ramp 阈值门禁 | `<name>` | `<name>` | `<time>` | `<path>` |
| 发布健康评分 | `<name>` | `<name>` | `<time>` | `<path>` |
| Readiness 检查 | `<name>` | `<name>` | `<time>` | `<path>` |

硬性要求：

- 回滚流必须明确 **SRE 主 DRI + 备援 DRI**，不可空缺。

---

## 7) 升级响应规则

- **SEV-1（发布阻断/触发回滚）**：SRE 立即拉起 PM 与 BE。
- **SEV-2（门禁失败但无用户影响）**：SRE + EVAL 在发布窗口内完成分诊与结论。
- **SEV-3（文档或非阻断漂移）**：BE/PM 在下一发布周期前闭环。

---

## 8) 周节奏建议

- **周一**：确认阈值档位与 RACI/DRI 是否最新。
- **周三**：审阅 burn-in 状态与回滚演练证据。
- **周五**：审阅 readiness 与 health score，执行 Go/No-Go 决策。

---

## 9) 变更管理

本文件中的责任变更，必须满足：

1. PM 书面确认。
2. 所有发布关键流由 SRE 书面确认。
3. 下一个发布窗口前完成 DRI/Backup 的实名更新。

