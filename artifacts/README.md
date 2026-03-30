# MODULE_STATUS_BOARD v2 — Artifacts

本目录存放 **发布门禁** 生成的 JSON（`release_gate_report.json` 等）与 **静态约定文件**。

## 生成方式

```bash
npm run release-gate:v2
```

**准生产 / 生产签字（不接受 `route_and_run --soft` 的 artifact）**：

```bash
npm run release-gate:v2:strict
```

（等价于 `RELEASE_GATE_C1_STRICT=1 npm run release-gate:v2`。）

若 `e2e_run_log.json` 含 **`c1_soft_pass: true`**，C1 将 **BLOCK**（需用不加 `--soft` 的路径重跑并覆盖 artifact）。

### `RELEASE_BLOCKED` 时怎么查

1. 终端 stderr 会打印 **gate summary**（M1 / C3 / C1 及 C1 的 `blockReason`）。
2. 打开 **`artifacts/release_gate_report.json`** 看各 Gate。
3. C1 细节：**`artifacts/c1_e2e_summary.json`** 的 **`blockReason`**（例如 strict 拒绝 soft）。

流程：

1. **M1_CLOSE**：`npm run test:ao-gate-p0`
2. **C3_READINESS_GREEN**：`npm run readiness:p1`（报告默认写入 `artifacts/readiness_report.json`）
3. **C1_E2E_READY**：需在准生产跑通后提供 **`e2e_run_log.json`**（见 `e2e_run_log.example.json`）；缺失则 C1 为 **BLOCK**，总门禁为 **RELEASE_BLOCKED**

## 文件说明

| 文件 | 说明 |
|------|------|
| `release_gate_report.json` | 顶层裁决：`RELEASE_ALLOWED` / `RELEASE_BLOCKED` |
| `m1_close_report.json` | M1 Gate |
| `c3_readiness_report.json` | C3 Gate（基于 `readiness_report.json` 的 `ok`） |
| `c1_e2e_summary.json` | C1 Gate 解析结果 |
| `readiness_report.json` | 由 `readiness-p1.sh` 生成（与仓库根 `readiness-p1-report.json` 可二选一） |
| `e2e_run_log.json` | **由准生产生成**：推荐 `tripnara-cli` 的 `route_and_run --write-artifact`；字段见 `e2e_run_log.example.json` |
| `owner_assignment.json` | 组织债：负责人 **ASSIGNED**（静态；与总表同步） |

## Git

生成型 JSON 可在 `.gitignore` 中忽略；`owner_assignment.json` 与 `e2e_run_log.example.json` 建议提交。
