# Travel Ontology P2 — Temporal Prediction & Outcome Reconciliation

**正式项目名：** Travel Ontology P2 — Temporal Prediction & Outcome Reconciliation  
**中文：** 时序预测与决策结果对账  
**状态：** `ACTIVE` — Gate 0 PASS · P2-01 Shadow APPROVED · P2-02A Quality PASS · P2-02B APPROVED_INTERNAL_ADVISORY_ONLY · P2-02C Observation Gate PASS · **P2-03A APPROVED / READY_FOR_SELECTED_USER_LIVE_ACTIVATION**（Kill Switch 默认开启；非 Pilot Pass）  
**能力边界：** [TRIPNARA-CAPABILITY-BOUNDARIES.md](./TRIPNARA-CAPABILITY-BOUNDARIES.md) — P2 为 **SHADOW** 时序预测与对账；P1 仅 **weather deterioration** 在 build；road/activity DEPRECATED。  
**上位：** [P1 Closure](./travel-ontology-p1-closure-report.md) · [P0 Closure](./travel-ontology-p0-closure-report.md) · [P2-01](./travel-ontology-p2-01-weather-shadow-pilot.md) · [P2-02A](./travel-ontology-p2-02a-weather-quality-gate.md) · [P2-02B](./travel-ontology-p2-02b-internal-temporal-advisory.md) · [P2-02C](./travel-ontology-p2-02c-observation-gate.md) · [P2-03A](./travel-ontology-p2-03a-selected-user-advisory.md) · [Weather Slice](./travel-ontology-p1-weather-deterioration-slice.md)

---

## 0. 阶段目标

| 阶段 | 已证明 |
|------|--------|
| P0 | 能判断（静态事实与裁决 SSOT） |
| P1 | 变化后能修复（持续世界变化闭环） |
| **P2** | 能提前判断，并用结果证明值得被信任（先 SHADOW） |

P2 **不**证明：再监控一种新世界事件。  
P2 **要**证明：

1. 风险 **何时开始 / 何时恶化 / 最晚何时行动**  
2. 预测与建议在事后能否被 **Outcome Reconciliation** 对账  

### 首条验证 Slice（强制复用）

**Weather Deterioration（P1-07）** — 不新增第四条持续变化语义。

---

## 1. 当前批准范围（ONT-P2-01）

见 [P2-01 Weather Shadow Pilot](./travel-ontology-p2-01-weather-shadow-pilot.md)。

| 允许 | 禁止 |
|------|------|
| IS + `WEATHER_DETERIORATION` + selected trips | 修改 ConstraintAssessment / Plan Revision |
| 只读 TravelWorldFact、Context Revision、路线/车辆 | 控制 READY / Confirm / Execute |
| SHADOW 预测版本替换、在线对账、Replay | 调用 Canonical Apply |
| 独立 Kill Switch + 控制边界指标 | 普通用户时序建议（须另开 Gate） |
| | 第四条持续变化语义 |

Kill Switch：`ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH=1`

---

## 2. 冻结契约

包路径：`src/travel-ontology/p2-temporal/`

| 契约 | 用途 |
|------|------|
| **TemporalImpact** | onset / deterioration / scopes / confidence |
| **InterventionDeadline** | 最晚行动时间 |
| **PredictionRecord** | SHADOW 预测信封 + control seals |
| **OutcomeReconciliation** | 预测 vs 实际对账 |

```
PredictionRecord.authorityMode = 'SHADOW'
  → 不得写入 OntologyCanonicalApply 有效链
  → 不得改变 ConstraintAssessment.outcome
  → 不得驱动 READY / Confirm / Execute
```

---

## 3. 产品叙事（用户面仍关闭）

目标文案形态（**未**对普通用户开放）：

> 预计 14:00 后该路段侧风风险明显上升；若继续原计划，最晚应在 11:30 前出发或改住上一站。

Shadow Gate PASS 后仍禁止用户面时序建议，直至单独 Gate。

---

## 4. 任务拆分

| 顺序 | 工作项 | 交付 | 状态 |
|------|--------|------|------|
| 0 | **ONT-P2-00** Charter + Gate 0 | 离线 Accuracy Harness | ✅ |
| 1 | **ONT-P2-01** Weather Production Shadow Pilot | SHADOW Pilot + 审批 APPROVED | ✅ |
| 2a | **ONT-P2-02A** Weather Temporal Prediction Quality Gate | 基线冻结 + 人工台账 + Replay 固化 | ✅ |
| 2b | **ONT-P2-02B** Internal Temporal Advisory Pilot | 内部 SHADOW 建议 | ✅ `APPROVED_INTERNAL_ADVISORY_ONLY` |
| 2c | **ONT-P2-02C** Observation Gate | 冻结观察报告准入 | ✅ PASS |
| 3a | **ONT-P2-03A** Selected User Temporal Advisory Pilot | Opt-in 用户建议 Pilot | ✅ APPROVED · READY_FOR_LIVE_ACTIVATION（非 Pilot Pass） |
| 4 | Cohort Expansion / Product Gate / Canonical | — | ⛔ |

命令：`npm run test:ontology-p2` · `npm run ontology:p2-observation-gate`

---

## 5. Gate 0 / Shadow Gate

| Gate | 状态 | 文档 |
|------|------|------|
| Gate 0 离线 | PASS | [p2-00](./travel-ontology-p2-00-gate0-offline-validation.md) |
| Shadow Gate | PASS | [p2-01](./travel-ontology-p2-01-weather-shadow-pilot.md) |
| Quality Gate | PASS | [p2-02a](./travel-ontology-p2-02a-weather-quality-gate.md) |
| Internal Advisory | **APPROVED_INTERNAL_ADVISORY_ONLY** | [p2-02b](./travel-ontology-p2-02b-internal-temporal-advisory.md) |
| Observation Gate | **PASS** | [p2-02c](./travel-ontology-p2-02c-observation-gate.md) |
| Selected User Pilot | **APPROVED / READY_FOR_SELECTED_USER_LIVE_ACTIVATION** | [p2-03a](./travel-ontology-p2-03a-selected-user-advisory.md) |
| Live Emission / Observation Pass | Kill Switch ON · Observation IN_PROGRESS | — |
| Cohort Expansion / Product Gate / Canonical | 未开 | — |

---

## 6. 持续禁止项

- 将 PredictionRecord 升为 Canonical 事实权威  
- 用预测覆盖 P1 Weather 产品行为或 Canonical Assessment  
- 自动授权不可逆 / 付费操作  
- 十二领域 / 新国家 Pack 借 P2 扩域  
- 普通用户时序建议（直至单独批准）  

---

## 修订

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1.0 | 2026-07-23 | ONT-P2-00：立项 Charter；契约 + 离线 Harness；Gate 0 |
| 0.2.0 | 2026-07-23 | ONT-P2-01：Weather Production Shadow Pilot 提交并审批 APPROVED |
| 0.3.0 | 2026-07-23 | ONT-P2-02A Quality Gate PASS；ONT-P2-02B Internal Advisory SUBMITTED |
| 0.4.0 | 2026-07-23 | ONT-P2-02B 人工批准 APPROVED_INTERNAL_ADVISORY_ONLY |
| 0.5.0 | 2026-07-23 | ONT-P2-02C Observation Gate PASS；ONT-P2-03A Selected User Auth SUBMITTED |
| 0.6.0 | 2026-07-23 | ONT-P2-03A APPROVE_SELECTED_USER_TEMPORAL_ADVISORY_PILOT；Kill Switch 默认 ON + dry-run 激活序 |
| 0.6.1 | 2026-07-23 | Pre-Activation Live Readiness Gate；状态定为 READY_FOR_SELECTED_USER_LIVE_ACTIVATION（非 Pilot Pass） |
