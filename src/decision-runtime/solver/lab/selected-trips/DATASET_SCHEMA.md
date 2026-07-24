# Selected Trip Dataset Schema（Frozen — M4-RA-01A）

> 真实行程到达时必须满足本合同。Lab **只使用导出副本**，不得引用线上可变路径。

## 目录

```
selected-trips/packs/<tripId>/
  manifest.json
  trip-context.json
  effective-plan.json
  evidence-snapshot.json
  constraints.json
  travel-matrix.json
  trigger.json
  expected-outcome.json
```

## 文件合同

| 文件 | schemaId | 必填要点 |
|------|----------|----------|
| `manifest.json` | `tripnara.selected_trip.manifest@v1` | tripId, planVersionId, environment, destination, intendedOperation, eligibility |
| `trip-context.json` | `tripnara.selected_trip.context@v1` | tripId, timezone, dateRange, destination=IS, deidentified |
| `effective-plan.json` | `tripnara.selected_trip.effective_plan@v1` | planVersionId 匹配, days[].activities with poiId / coords OR matrix-only flag |
| `evidence-snapshot.json` | `tripnara.selected_trip.evidence@v1` | evidenceVersionId, frozenAt, sources[] |
| `constraints.json` | `tripnara.selected_trip.constraints@v1` | canonical constraint ids + projection hints |
| `travel-matrix.json` | `tripnara.selected_trip.travel_matrix@v1` | from→to durationMin，可重建 |
| `trigger.json` | `tripnara.selected_trip.trigger@v1` | operation ∈ approved scope, trigger kind |
| `expected-outcome.json` | `tripnara.selected_trip.expected_outcome@v1` | accept \| reject \| fallback + locality / notes |

## 硬性校验（validate CLI）

- tripId / planVersionId 跨文件一致  
- timezone、日期完整  
- POI 坐标缺失 ⇒ warn；矩阵也缺 ⇒ error  
- 时间窗合法（start ≤ end）  
- booked 项显式标记  
- Evidence 版本存在  
- operation 落在首批批准 scope  
- 禁止敏感 PII 字段（email/phone/name/payment）  
- expected-outcome 完整  
- travel-matrix 可重建（覆盖计划活动对）

```bash
npm run lab:validate-selected-trip -- --tripId <tripId>
npm run lab:assemble-selected-pilot
```
