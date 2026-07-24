# ONT-P2-00 — Gate 0 Offline Validation

**状态：** Gate 0 **PASS**（离线验证）；ONT-P2-01 Shadow Pilot **已单独批准** — 见 [P2-01](./travel-ontology-p2-01-weather-shadow-pilot.md)  
**上位：** [P2 Charter](./travel-ontology-p2-temporal-prediction-charter.md) · [P1 Closure](./travel-ontology-p1-closure-report.md)  
**命令：** `npm run ontology:p2-gate0-offline` · `npm run test:ontology-p2-gate0`

---

## 1. 本轮范围

| 做 | 不做 |
|----|------|
| 冻结 TemporalImpact / InterventionDeadline / PredictionRecord / OutcomeReconciliation | 生产 Shadow Pilot |
| 复用 **WEATHER_DETERIORATION** 离线预测 | 新增第四条持续变化语义 |
| 历史预报 × 实际天气 × P1 Replay 形状对账 | 修改 P0/P1 Canonical Assessment |
| 预测 `authorityMode=SHADOW` + control seals | 控制 READY / Confirm / Execute |

Gate 0 **PASS** 后，才允许 **单独申请** 生产 Shadow Pilot（ONT-P2-07 前置）。本文件不批准该 Pilot。

---

## 2. 通过标准

- [x] 四契约 schemaId 稳定  
- [x] Offline Accuracy Harness ≥4 cases 可跑通  
- [x] 指标含误报、漏报、onset 误差、deadline lead  
- [x] 全部预测 SHADOW；seals 禁止 Assessment / Apply / READY / Confirm / Execute  
- [x] semanticScope 仅 `WEATHER_DETERIORATION`  
- [x] Replay fingerprint 稳定  
- [x] 生产 Shadow Pilot — **已由 ONT-P2-01 单独批准（SHADOW）**；用户面时序建议仍禁止  

---

## 3. 产物

`artifacts/ontology-p2/gate0/gate0-offline.latest.json`

包路径：`src/travel-ontology/p2-temporal/`

---

## 修订

| 版本 | 日期 | 说明 |
|------|------|------|
| 0.1.0 | 2026-07-23 | ONT-P2-00 Gate 0 离线验证说明 |
