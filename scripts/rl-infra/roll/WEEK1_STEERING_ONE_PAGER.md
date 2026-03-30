# RL Fully Online - Week 1 周会单页

## 1. 本周目标

通过以下验证项，将状态从“guardrails 已就绪”推进到“具备上线运行准备”：

- 严格禁模拟（no-simulation）行为可持续满足
- 受控 fallback 行为符合预期
- canary 放量与回滚具备可操作性
- 生产 ramp gate 能稳定执行

## 2. 当前已具备能力

- Staging 门禁：`staging-fast-gate`、`staging-strict-gate`
- Prod 守门：`prod-fast-gate`、`prod-strict-gate`
- Burn-in 工作流：`roll-staging-burnin.yml`
- Canary 工作流：`roll-canary-release.yml`
- Ramp 工作流：`roll-prod-ramp-gate.yml`
- 关键脚本：
  - `verify-staging-no-simulation.sh`
  - `verify-prod-guardrails.sh`
  - `verify-prod-ramp-thresholds.sh`
  - `canary-rollout.sh`、`canary-rollback.sh`
  - `run-sre-drill.sh`

## 3. Week-1 必达里程碑

1) Staging 严格门禁全部通过（全绿）  
2) Burn-in 完成并产出制品（`burnin-summary.jsonl`）  
3) Canary 放量 + 回滚演练完成  
4) Prod ramp gate 完成通过/失败场景验证  
5) SRE 演练完成并产出验收报告草案

## 4. KPI 阈值（Go/No-Go 输入）

- 真实策略命中率（real policy rate）>= 0.95
- fallback 率 <= 0.01
- simulation 率 = 0
- P95 延迟 <= 1500ms
- 错误率 <= 0.02

## 5. Owner 分工

- Backend：运行时契约、fallback/strict 行为、日志事件
- RL-Infra：bridge/worker 稳定性、burn-in 执行、制品产出
- SRE：prod guardrails、ramp gate、回滚演练、告警链路
- Product：KPI 签字确认与最终 Go/No-Go 组织推动

### 5.1 UX 介入边界（会前检查）

默认情况下，UX 不进入发布主链 owner（不承担 R/A）。  
仅当本次变更满足以下任一条件时，才将 UX 拉入为 C（Consulted）：

- 新增/修改用户可见风险提示、阻断原因或告警文案语义
- 新增/修改审批确认语义（如 `NEED_USER_CONFIRM` 分类/说明）
- 决策解释字段结构变化，可能影响用户理解

如果本次仅涉及后端稳定性、性能、观测、阈值治理，则 UX 保持 I（Informed）即可。

## 6. Top Risks & Immediate Mitigations

## 6. 主要风险与即时缓解

- Burn-in 负载下 worker 不稳定  
  - 缓解：执行前先做 worker readiness 预检，并重点监控 `bridge_call_failure`
- 隐性 fallback 依赖  
  - 缓解：强化 fallback 可观测性，并在 ramp gate 侧进行阻断
- 运行期回滚延迟  
  - 缓解：执行回滚演练并留存 MTTR 证据

## 7. 本次会议需决策事项

1) 确认 Week-1 KPI 阈值作为发布门禁输入  
2) 确认各条流 owner 与 DRI 备援人选  
3) 确认下周 canary 准入标准（10% 流量）

## 8. 会议退出标准

- Owners 已确认
- 时间线已确认
- KPI 阈值已确认
- Go/No-Go 评审时段已排定

---

## 9. RACI 参考（中文）

为避免 owner 理解偏差，Week1-3 的责任分配、审批链与 DRI/Backup 模板统一以以下文档为准：

- `scripts/rl-infra/roll/RACI_WEEK1_3.md`

建议在每次周会（Steering）开始前先校对该文件中的：

- 核心流 RACI 是否与当前工作流一致
- Go/No-Go 审批链是否变更
- 回滚流是否存在主/备 DRI

---

## 10. 能力地图参考

为便于新成员快速理解“开发技能 / 专家角色 / 用户能力 / 代码锚点”的映射，建议同步查看：

- `scripts/rl-infra/roll/CAPABILITY_MAP.md`
