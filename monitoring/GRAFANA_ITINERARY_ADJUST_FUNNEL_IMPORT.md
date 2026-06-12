# ITINERARY_ADJUST / POI_SLOT_FILL 漏斗 Grafana 导入

监控「草案创建 → 用户点 Apply → 自动/手动落库成功」全链路。

## 导入步骤

1. Grafana → **Dashboards** → **New** → **Import**
2. 上传：`monitoring/grafana/itinerary-adjust-funnel-dashboard.json`
3. 选择 Prometheus 数据源（与应用 `/metrics` 同一实例）
4. 保存后 UID：`tripnara-itinerary-adjust-funnel`

## Prometheus 指标

| 指标 | 标签 | 含义 |
|---|---|---|
| `tripnara_itinerary_adjust_funnel_total` | `stage` | `draft_created` / `apply_clicked` / `auto_apply` / `user_apply` |
| | `outcome` | `success` / `failure` / `skipped` |
| | `sub_intent` | `poi_slot_fill` / `strong_modification` / `exploratory` |
| | `execution_mode` | `AUTO` / `SEMI_AUTO` / `ADVICE_ONLY` |
| | `reason` | `unresolved_places` / `no_sparse_days` / `user_confirmed_draft_apply` 等 |

结构化日志（Loki）：`event=itinerary_adjust_funnel` JSON 行，字段与上表一致。

## 重点面板

| 面板 | 健康预期 |
|---|---|
| 草案创建 vs Apply 点击 | `poi_slot_fill` 下 SEMI_AUTO 成功时 Apply 点击应趋近 0 |
| 落库成功率 | 1h 滚动 > 75%；`unresolved_places` 失败应下降 |
| 失败原因 Top | 若 `unresolved_places` 居高 → 检查 poi.search place_id 绑定 |

## 前端 Apply 契约

见 `src/agent/assistants/planning-assistant/FRONTEND_INTEGRATION_GUIDE.md`：

- 单日重排：`apply_mode: 'replace_day'` + `items`
- POI_SLOT_FILL：`apply_mode: 'append_sparse_days'` + `days[]`
- 失败时读 `payload.itinerary_adjust_apply_result`（含 `reason` / `answer_text`）
