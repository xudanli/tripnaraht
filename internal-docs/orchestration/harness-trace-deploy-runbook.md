# Harness Trace 排障部署 Runbook（Observability P0）

> **Companion**：[harness-production-checklist.md](./harness-production-checklist.md) · [harness-architecture-map.md](./harness-architecture-map.md)  
> **Env 模板**：仓库根目录 [`.env.harness-production.example`](../../.env.harness-production.example)

## 1. 何时开启

| 场景 | `HARNESS_TRACE_MODE` | 说明 |
|------|----------------------|------|
| 生产默认 | `off`（或不设） | 零 trace 内存开销 |
| 预发 / 排障 | `on-failure` | 仅失败请求逆向合成 trace |
| 深度调试 | `full` | 每步 append；开销大 |

推荐：**staging 常开 `on-failure`**；生产仅在 badcase 窗口期开启。

## 2. 最小配置

在 API 进程环境变量中设置：

```bash
HARNESS_TRACE_MODE=on-failure
HARNESS_TRACE_EXPORT_DIR=artifacts/harness-on-failure
```

K8s 示例（挂载 volume）：

```yaml
env:
  - name: HARNESS_TRACE_MODE
    value: "on-failure"
  - name: HARNESS_TRACE_EXPORT_DIR
    value: "/var/log/tripnara/harness-traces"
volumeMounts:
  - name: harness-traces
    mountPath: /var/log/tripnara/harness-traces
volumes:
  - name: harness-traces
    emptyDir: {}
```

本地开发：复制 `.env.harness-production.example` 中 Observability 块到 `.env`，重启 `npm run dev`。

## 3. 失败 trace 如何产生

1. Kernel Harness 步失败 → `DecisionKernelService.handleHarnessStepFailure`
2. `HarnessTraceRecorderService.retrofitTrajectoryOnFailure` 逆向合成
3. 若配置了 `HARNESS_TRACE_EXPORT_DIR` → 写入 `{traceId}.json`
4. `route_and_run` 响应 `observability.harness_trace_export_path` 返回相对路径

源码锚点：`src/harness/tracing/harness-trace-mode.util.ts`、`decision-kernel.service.ts`。

## 4. 运维命令

### 4.1 列出最近落盘 trace

```bash
bash scripts/list-harness-traces.sh
# 或指定目录：
bash scripts/list-harness-traces.sh artifacts/harness-on-failure 20
```

### 4.2 从 API 响应定位 trace

```bash
# 假设 response.json 为 route_and_run 响应
jq -r '.observability.harness_trace_export_path // empty' response.json
jq -r '.observability.harness_active_trace_id // empty' response.json
jq -r '.observability.otel_trace_id // empty' response.json
jq -r '.meta.run_id // empty' response.json
```

**APM ↔ Harness JSON 联查（Observability P2）**：网关/前端若透传 W3C `traceparent`，响应会回显 `observability.otel_trace_id` / `otel_span_id`；落盘 trace JSON 的 `meta.otelTraceId` 与之一致。在 Datadog/Jaeger 用 `otel_trace_id` 搜请求，再用 `harness_trace_export_path` 打开本地 JSON。

### 4.3 与 eval 脚本联动

```bash
# 需 API 进程已开 HARNESS_RECORD_TRACE=1 或 HARNESS_TRACE_MODE=full/on-failure + EXPORT_DIR
npx ts-node --transpile-only scripts/eval-route-and-run-trace.ts
```

### 4.4 CLI（Observability P1）

```bash
tripnara harness trace list --dir artifacts/harness-on-failure
tripnara harness trace open "<observability.harness_trace_export_path>" --print
tripnara harness trace from-response /tmp/route_and_run.json --show
tripnara run-route-and-run ... --debug --format table   # 打印 open 命令提示
```

---

## 5. 验收清单

- [ ] 故意触发 Harness 失败（如 Context Lint STRICT + 非法 DSO 字段）
- [ ] 响应含 `observability.harness_trace_export_path`
- [ ] 磁盘存在对应 JSON，`retrofit.failedPhase` 与失败步一致
- [ ] 日志含 `[HarnessTraceExport] wrote ...`

## 6. 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 无 export path | 未设 `HARNESS_TRACE_EXPORT_DIR` 或请求成功 | 确认 on-failure + 失败路径 |
| 路径有但文件不存在 | 多 Pod 写本地盘 | 挂共享 volume 或改对象存储导出 |
| 只有 shadow 事件 | `HARNESS_SHADOW_AFTER_PHASE=1` | 与 on-failure 主 trace 不同源，见 DSO `harnessShadow` |

---

*维护：变更 Trace 语义或 observability 字段时，同步更新 [harness-production-checklist.md](./harness-production-checklist.md) §4。*
