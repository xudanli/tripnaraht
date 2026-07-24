# Harness LLM Cost / Token Grafana 导入

> **Companion**：[harness-production-checklist.md](../internal-docs/orchestration/harness-production-checklist.md) · `cost_history_v1` · `tripnara harness cost history`

## 1. 前置

1. 应用已 migrate `llm_token_logs` 表（`LlmUsageRecorderService` DB 写入开启）
2. Grafana 已配置 **PostgreSQL** 数据源，且 `DATABASE_URL` 指向**同一 database**
3. （可选）API 进程设置配额告警 env：
   - `HARNESS_COST_ALERT_GLOBAL_QUOTA_PCT=90`
   - `HARNESS_COST_ALERT_DAILY_USD=50`

## 2. 导入看板

1. Grafana → **Dashboards** → **New** → **Import**
2. 上传：`monitoring/grafana/harness-cost-token-dashboard.json`
3. 变量 **PostgreSQL (`DS_POSTGRES`)** 选择应用库数据源

## 3. 面板说明

| 面板 | 数据源 | 说明 |
|------|--------|------|
| Daily LLM cost | `llm_token_logs` 按 UTC 日聚合 | 对齐 admin `cost_history.daily_buckets` |
| Daily token volume | 同上 | token 趋势 |
| Today cost / tokens | UTC 日历日 | 与 CLI `cost history` today 行对照 |
| Top steps by cost | `step_name` 分组 | 排障高成本 step |
| Cost by LLM provider | `provider` 分组 | 对齐 admin `llm_routing.providers` · CLI `llm-routing status` |
| Sanity | `COUNT(*)` | 0 行 → 连错库或未开 DB logging |

## 4. CLI 对照（无 Grafana 时）

```bash
tripnara harness cost status --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness cost history --json
tripnara harness llm-routing status --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness shadow-harness status --token "$ADMIN_DIAGNOSTICS_TOKEN"
```

## 5. 告警

Grafana 看板为**趋势可视化**；结构化告警仍以 admin diagnostics `cost_history.alerts` 为准（Redis 配额 + DB 日成本 spike）。

后续可在 Grafana Alerting 对 `today_cost_usd` 或 Prometheus（若导出 shadow grader 指标）加规则。

---

*维护：变更 `llm_token_logs` schema 或 `HarnessCostHistoryV1` 时同步 SQL 与本文档。*
