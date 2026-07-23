# ONT-P2-02A — Weather Temporal Prediction Quality Gate

**状态：** Quality Gate **PASS**（基线冻结 + 台账完成 + Replay 固化）  
**工作项：** ONT-P2-02A  
**上位：** [P2 Charter](./travel-ontology-p2-temporal-prediction-charter.md) · [P2-01 Shadow Pilot](./travel-ontology-p2-01-weather-shadow-pilot.md)

---

## 1. 冻结基线轴

| 轴 | Baseline 字段 |
|----|----------------|
| 时间误差 | `onsetAbsErrorMinutesP95` · `deteriorationAbsErrorMinutesP95` · `minMeanDeadlineLeadMinutes` |
| Actionable False Negative | `maxActionableFalseNegativeRate` |
| False Positive | `maxFalsePositiveRate` |
| 预测反转 | `maxPredictionReversalRate` |
| 对账完成率 | `minReconciliationCompletionRate` |
| Unobservable | `maxUnobservableRate` |

权威：全部 **SHADOW**；国家 **IS**；语义 **WEATHER_DETERIORATION**。

---

## 2. 人工复核台账

每个质量差异必须：

1. 分类（`QualityClassification`）  
2. Replay 固化（`replayCaseId` + `rp_q_*` fingerprint）  
3. `humanReviewStatus` ∈ `REVIEWED | NOT_REQUIRED | WAIVED`（不得残留 `PENDING`）

台账 schema：`tripnara.ontology_p2_weather_human_review_ledger@v1`

---

## 3. Gate 通过后

允许：**申请** ONT-P2-02B Internal Temporal Advisory Pilot（`SUBMITTED`，不自动 APPROVED）。

仍禁止：普通用户时序建议、改 Assessment / Plan / READY / Confirm / Execute、Canonical Apply、第四语义。

---

## 4. 命令与产物

```bash
npm run test:ontology-p2-quality-gate
npm run ontology:p2-weather-quality-gate
```

| 产物 | 路径 |
|------|------|
| Gate 报告 | `artifacts/ontology-p2/quality-gate/quality-gate.latest.json` |
| 冻结基线 | `artifacts/ontology-p2/quality-gate/quality-baseline.latest.json` |
| 人工台账 | `artifacts/ontology-p2/quality-gate/human-review-ledger.latest.json` |
| Diff Replay 索引 | `artifacts/ontology-p2/quality-gate/quality-discrepancy-replays.latest.json` |
| 02B 申请 | `artifacts/ontology-p2/internal-advisory/internal-temporal-advisory-authorization.json` |

---

## 修订

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-23 | ONT-P2-02A Quality Gate + 台账 + 基线冻结；通过后提交 02B |
