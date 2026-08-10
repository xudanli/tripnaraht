# Travel Causal Decision — Phase Gate

**状态：** `P0 Functional Complete` → **Pilot Validation / Productization Hardening**  
**日期：** 2026-07-17  
**主线工作项：** Iceland Wind Causal Decision Pilot Validation  

**能力边界：** 见 [TRIPNARA-CAPABILITY-BOUNDARIES.md](../../internal-docs/product/TRIPNARA-CAPABILITY-BOUNDARIES.md) — 本模块为**规则型因果预测**读模型与 Pilot，不宣称隐式结构挖掘或学习型世界模型。

---

## 阶段判断

本轮正式标记为：

> **Travel Causal Decision P0 — Functional Complete**

当前已不再是「因果架构设计阶段」，而是具备一条可运行产品链：

```text
世界事实变化
→ 因果事件识别
→ 时序预测与行动期限
→ 干预方案及不处理基线
→ 方案验证
→ 用户选择并执行
→ 真实观测采集
→ 预测结果对账
→ 规则版本追踪
```

已跨过三个门槛：

1. **不只输出风险描述** — 因果链 + 恶化时间 + 行动截止  
2. **不只生成建议** — 可进入 Gateway / Execute / Plan Version  
3. **执行完不结束** — GPS / 签到 / Validation → Outcome Reconciliation  

---

## 下一阶段唯一主线

**Iceland Wind Causal Decision Pilot Validation**

目标：在真实或准真实行程中证明 —— 正确发现问题、合理期限、有效方案、准确对账。  
不是继续证明「代码能跑」。

### Pilot 验证五件事

| # | 主题 | 关键否决点 |
|---|------|-----------|
| 1 | 根因正确 | 派生影响不得升为独立根因 / 重复卡片 |
| 2 | 时间有价值 | deadline 不过早打扰、不过晚不可行动；contextHash 失效 |
| 3 | 方案可执行 | 验证 100% 通过；Apply 后无新硬冲突 |
| 4 | 不处理基线可信 | ETA / 失约概率 / 损失 / 假设完整 |
| 5 | 对账真实 | Apply≠确认；无观测→UNOBSERVABLE；确定性状态机 |

证据与案例集：`pilot/iceland-wind/`  
Harness：`pilot/iceland-wind/iceland-wind-pilot.harness.spec.ts`

---

## 明确暂时不做

- 新世界模型抽象层 / 新 Decision Engine  
- 新 AI 人格或 Agent  
- Copilot 变推理引擎  
- 复杂因果图可视化  
- 通用规则低代码 / 审核台（P2）  
- 多国 Pack 并行扩张  
- 宣称完整自我演进因果世界模型  

---

## 推荐研发顺序

1. 强风真实样本 Pilot（本目录）  
2. Web / Mobile 决策卡完整接线 — 见 `../trips/copilot/FRONTEND_INSIGHT_CARD.md`  
3. 稳定 Causal Decision 产品 API（BFF）— 见 `api/CAUSAL_DECISION_API.md` ✅  
4. Pilot 指标与对账报表  
5. 封路跨日 live 引擎  
6. 疲劳 live 引擎  
7. 规则持久化与审核台  

---

## 一句话状态

TripNARA 已完成旅行因果决策 P0 契约和强风端到端运行闭环；下一阶段进入真实样本验证与产品化加固，重点证明预测期限、干预方案和结果对账在真实旅行中的有效性，而不是继续新增架构抽象。
