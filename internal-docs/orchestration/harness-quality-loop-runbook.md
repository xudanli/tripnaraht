# Harness 在线质量环 Runbook

> **Companion**：[harness-production-checklist.md](./harness-production-checklist.md) · L1 smoke · decision-closure golden

## 1. 组成

| 层 | 能力 | 锚点 |
|----|------|------|
| **CI / batch** | L1 smoke + decision-closure jest | `npm run harness:quality-loop` |
| **Runtime 采样** | 按 `request_id` 稳定 cohort | `HARNESS_QUALITY_SAMPLE_RATE` → `observability.quality_sample_v1` |
| **Admin / CLI** | 快照 + blockers | `GET /api/admin/diagnostics/harness` · `tripnara harness quality status` |

## 2. Batch 跑批（cron / 发版前）

```bash
npm run harness:quality-loop
# 或
bash scripts/run-harness-quality-loop.sh
tripnara harness quality run
```

报告：`artifacts/harness-quality-loop/last-run.json`

含：
- `l1_smoke.passed` / `path_fingerprint` / `baseline_match`
- `decision_closure.passed`（`country-decision-closure.spec.ts`）
- `overall_passed`

建议 cron（ nightly ）：

```cron
0 3 * * * cd /app/tripnara && bash scripts/run-harness-quality-loop.sh >> /var/log/tripnara/quality-loop.log 2>&1
```

## 3. Runtime 采样（staging / 生产）

```bash
# 1% 流量打 quality cohort 标记（不额外跑 jest）
HARNESS_QUALITY_SAMPLE_RATE=0.01
```

响应字段：

```json
"observability": {
  "quality_sample_v1": {
    "schemaId": "tripnara.harness_quality_sample@v1",
    "sampled": true,
    "sample_rate": 0.01,
    "cohort": "quality_loop"
  }
}
```

可与 badcase catalog、OTel trace 联查做离线 eval 扩展。

## 4. Admin 验收

```bash
tripnara harness quality status --token "$ADMIN_DIAGNOSTICS_TOKEN"
```

`quality_loop.ops_readiness.ready=true` 需：

- `ORCHESTRATOR_CONTEXT_LINT_ENABLED=1` + `STRICT=1`
- L1 `pathFingerprintBaseline` 已钉扎
- `last-run.json` 存在且 `overall_passed=true`

## 5. Context Lint 生产启用

见 [harness-context-lint-runbook.md](./harness-context-lint-runbook.md)。

---

*维护：变更 L1 套件或 decision-closure fixture 时同步跑批并更新 baseline。*
