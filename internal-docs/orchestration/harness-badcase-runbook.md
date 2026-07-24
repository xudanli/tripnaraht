# Harness Badcase 采集 Runbook（Observability P2）

> **Companion**：[harness-trace-deploy-runbook.md](./harness-trace-deploy-runbook.md) · [harness-production-checklist.md](./harness-production-checklist.md)

## 1. 目标

将 `HARNESS_TRACE_MODE=on-failure` 落盘的 trace JSON **索引为可检索 catalog**，供排障 / eval / 回归采样；本仓无前端 UI，检索经 **CLI**。

## 2. 前置

```bash
HARNESS_TRACE_MODE=on-failure
HARNESS_TRACE_EXPORT_DIR=artifacts/harness-on-failure
```

失败请求产生 `{exportedAt, trace}` JSON 后，方可采集。

## 3. 一次性 / 手动采集

```bash
tripnara harness badcase collect
# 或
bash scripts/collect-harness-badcases.sh
```

输出 catalog 默认路径：

```text
artifacts/harness-badcases/catalog.json
```

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `HARNESS_TRACE_EXPORT_DIR` | `artifacts/harness-on-failure` | 扫描源 |
| `HARNESS_BADCASE_CATALOG_DIR` | `artifacts/harness-badcases` | catalog 目录 |
| `HARNESS_BADCASE_COLLECT_LIMIT` | `500` | 单次扫描文件上限 |

## 4. 定时采集（cron）

```cron
# 每 15 分钟索引新 on-failure trace
*/15 * * * * cd /app/tripnara && bash scripts/collect-harness-badcases.sh >> /var/log/tripnara/badcase-collect.log 2>&1
```

K8s：CronJob 挂载与 API 相同的 trace export volume，执行同上脚本。

## 5. 检索

```bash
# 最近 badcase
tripnara harness badcase list --limit 20

# 按 phase / request / violation code / otel id
tripnara harness badcase search VERIFY
tripnara harness badcase search PLAN_TOPOLOGY_GAP

# 打开 trace 绝对路径
tripnara harness badcase open <catalog-entry-id>
tripnara harness trace show artifacts/harness-on-failure/....json
```

JSON 输出：`--json` 适用于 jq / CI 归档。

## 6. Catalog 条目字段

每条 `tripnara.harness_badcase@v1` 含：

- `failed_phase` / `final_status` / `violation_codes`
- `request_id` / `harness_active_trace_id` / `otel_trace_id`
- `trace_export_path` — 与 `observability.harness_trace_export_path` 对齐

## 7. 与 eval 联动

```bash
# 从 catalog 取 path 跑 trace 断言
jq -r '.entries[0].trace_export_path' artifacts/harness-badcases/catalog.json
tripnara harness trace show "$(jq -r '.entries[0].trace_export_path' artifacts/harness-badcases/catalog.json)"
```

---

*维护：变更 trace export 格式时同步 `tripnara-cli/src/core/harness-badcase-catalog.util.ts`。*
