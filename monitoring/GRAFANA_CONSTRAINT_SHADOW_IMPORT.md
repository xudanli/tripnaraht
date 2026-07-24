# Constraint SHADOW_COMPARE Grafana 导入

> **Companion：** [`DECISION_RUNTIME_ENV.md`](../src/decision-runtime/DECISION_RUNTIME_ENV.md) · `npm run constraint-shadow:staging`

## 1. 前置

1. API 进程设置：

```bash
CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1   # 或仅 MODE=SHADOW_COMPARE
```

2. Prometheus 抓取应用 `/metrics`（与现有 Decision OS 看板同一 job）。

## 2. 导入看板

1. Grafana → **Dashboards** → **Import**
2. 上传：`monitoring/grafana/constraint-shadow-compare-dashboard.json`
3. 变量 **Prometheus (`DS_PROMETHEUS`)** 选择 TripNARA scrape 数据源

## 3. 指标

| Prometheus | 说明 |
|------------|------|
| `tripnara_constraint_shadow_compared_total` | 双跑次数（累计） |
| `tripnara_constraint_shadow_diverged_total{divergence_kind}` | 分歧次数（按 kind） |

## 4. HTTP 对照（无 Prometheus 时）

```bash
curl -s http://localhost:3000/api/decision-engine/v1/runtime-capabilities | jq .
npm run constraint-shadow:staging
npm run constraint-shadow:smoke
```

`constraintShadowMetrics` 为进程内 snapshot；重启后清零。Prometheus 为跨重启累计。

## 5.  rollout 判读

| Divergence rate | 建议 |
|-----------------|------|
| &lt; 5% | 可继续扩大 SHADOW_COMPARE 流量 |
| 5–15% | 按 `divergence_kind` 排障，勿切 `ON` |
| &gt; 15% | 暂停 rollout，修 provider / mapper |

Authority 切换至 canonical 仅当 `CONSTRAINT_GATEWAY_MODE=ON` 且 formal calibration 闭环。
