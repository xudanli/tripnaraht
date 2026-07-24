# ONT-P2-02B — Internal Temporal Advisory Pilot

**状态：** Authorization **`APPROVED_INTERNAL_ADVISORY_ONLY`** · Observation Report **FROZEN** · 见 [02C](./travel-ontology-p2-02c-observation-gate.md)  
**决策：** `APPROVE_INTERNAL_TEMPORAL_ADVISORY_PILOT`  
**上位：** [P2-02A](./travel-ontology-p2-02a-weather-quality-gate.md) · [P2 Charter](./travel-ontology-p2-temporal-prediction-charter.md)

---

## 批准范围（冻结）

| 条件 | 值 |
|------|-----|
| destination | `IS` |
| semanticScope | `WEATHER_DETERIORATION` |
| tripId | ∈ selectedInternalTrips |
| viewer | ∈ approvedInternalReviewers |
| authorityMode | `SHADOW` |
| audience | `SELECTED_INTERNAL_ONLY` |
| canonicalControl | `FORBIDDEN` |
| externalUserEmission | `FORBIDDEN` |

### 允许

展示 onset / deterioration / interventionDeadline / 推荐草案 / 证据与置信度；收集结构化反馈；反馈进入 Outcome Reconciliation。

### 禁止

Assessment mutation · Canonical Apply · Plan Revision · READY/Confirm/Execute · 普通用户推送 · 阻断通知 · 自动改行程 · 弱化 P1 Canonical。

---

## 独立展示层 Kill Switch

`ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH=1`

只停止内部建议发射与展示；**不**停止 PredictionRecord、Outcome Reconciliation、P1 Weather、P0/P1 Canonical。

---

## 契约要点

- `InternalTemporalAdvisory` 绑定 `predictionId` + **`predictionVersion`** + **`contextRevision`** + `factSetVersion`
- 五段固定文案；**权威状态段始终可见**
- 生命周期：ACTIVE → WITHDRAWN（预测替换）/ EXPIRED / RECONCILED
- 双反馈：预测质量 ≠ 产品建议有用性

---

## 命令与产物

```bash
npm run test:ontology-p2-internal-advisory
npm run ontology:p2-internal-advisory-approve
```

| 产物 | 路径 |
|------|------|
| 审批件 | `artifacts/ontology-p2/internal-advisory/internal-temporal-advisory-authorization.json` |
| 观察报告 | `artifacts/ontology-p2/internal-advisory/internal-advisory-observation.latest.json` |
| 故障注入 | `artifacts/ontology-p2/internal-advisory/fault-injection.latest.json` |

---

## 下一步（仍禁止越级）

仅可申请：**Selected User Temporal Advisory Pilot**（另开 Observation Gate 后）。  
不可申请：P2 Canonical、自动改行程、预测触发 BLOCK、第四语义、普通用户全量。

---

## 修订

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-23 | 人工批准 APPROVED_INTERNAL_ADVISORY_ONLY + 故障注入 + 观察报告冻结 |
