# Harness Kernel 硬门禁 Runbook（Control P0+）

> **Companion**：[harness-production-checklist.md](./harness-production-checklist.md) · [harness-architecture-map.md](./harness-architecture-map.md)  
> **Env 模板**：[`/.env.harness-production.example`](../../.env.harness-production.example)

## 1. 语义

| 模式 | 环境变量 | 行为 |
|------|----------|------|
| **Shadow 观测**（默认） | 不设 / `HARNESS_SHADOW_AFTER_PHASE=0` | 主链不受 Harness 复验影响 |
| **Shadow 复验** | `HARNESS_SHADOW_AFTER_PHASE=1` | 每 Kernel phase commit 后跑 shadow Harness；失败仅写 `shadow_harness_events` + 指标 |
| **演练 Strict** | `HARNESS_SHADOW_AFTER_PHASE=1` + `HARNESS_KERNEL_SHADOW_STRICT=1` | shadow 失败 **抛错阻断**主链（预发演练） |
| **生产硬门禁** | `HARNESS_KERNEL_HARD=1` | 运维签字后启用：等价 **shadow after phase + strict block** |

源码：`src/decision/kernel/decision-kernel.service.ts` · `src/decision/kernel/harness-kernel-hard-mode.util.ts`

## 2. 签字前验收（sign-off）

### 2.1 开启 shadow 观测（staging）

```bash
HARNESS_SHADOW_AFTER_PHASE=1
# 可选：调低阈值便于预发观察
HARNESS_SHADOW_CONSECUTIVE_THRESHOLD=50
ADMIN_DIAGNOSTICS_HARNESS_ENABLED=1
ADMIN_DIAGNOSTICS_TOKEN=<secret>
```

### 2.2 查连续成功次数

```bash
tripnara harness kernel-hard status \
  --api-base https://staging-api.example.com \
  --token "$ADMIN_DIAGNOSTICS_TOKEN"
```

关注输出：

- `consecutive=<n>/<threshold>` — 进程内连续 shadow PASSED/REPAIRED 次数
- `sign_off_eligible=true` — 达到阈值、可进入签字
- `blockers=` — 未达标原因（如 `consecutive_12_lt_100`）

HTTP：`GET /api/admin/diagnostics/harness` → `kernel_hard` 段。

### 2.3 签字 checklist（人工）

- [ ] staging 运行 ≥7 天，`sign_off_eligible=true` 且 blockers 为空
- [ ] 无未解释 L3 shadow 失败 spike（查 `by_stage_status` / 日志 `tripnara_metric=harness_shadow_check`）
- [ ] on-failure trace 可检索（`HARNESS_TRACE_MODE=on-failure` + export dir）
- [ ] 产品/运营确认 shadow 失败文案与 HITL 路径可接受
- [ ] 回滚方案：去掉 `HARNESS_KERNEL_HARD` 并重启 Pod（秒级回退）

## 3. 生产启用

```bash
HARNESS_KERNEL_HARD=1
# 以下由 HARD 自动隐含，无需重复设：
# HARNESS_SHADOW_AFTER_PHASE=1
# HARNESS_KERNEL_SHADOW_STRICT=1
```

K8s：在 Secret/ConfigMap 增加变量后 **滚动重启** API Deployment。

启动日志应出现：

```text
[Harness] HARNESS_KERNEL_HARD=1 — post-phase shadow harness failures BLOCK main chain
```

## 4. 失败时会发生什么

1. Kernel phase 正常 commit
2. `applyShadowHarnessPostPhase` 对该 phase 映射的 Harness step 复验
3. 若 status 非 `PASSED`/`REPAIRED`：
   - 指标：`HarnessShadowMetricsCollector` 记录（含 BLOCKED/L3 → consecutive 清零）
   - **硬门禁**：抛错，主链中断；错误前缀 `HARNESS_KERNEL_HARD:`
4. 若同时开 trace：`on-failure` 路径可落盘 JSON（见 [harness-trace-deploy-runbook.md](./harness-trace-deploy-runbook.md)）

## 5. 回滚

```bash
# 移除或设为 0
unset HARNESS_KERNEL_HARD
# 滚动重启
```

回退后 shadow 指标仍可通过单独开 `HARNESS_SHADOW_AFTER_PHASE=1` 继续观测。

## 6. 与 Shadow Grader 的关系

| 能力 | 作用 |
|------|------|
| **Kernel Hard** | 同步 Harness rubric，阻断不合规主链输出 |
| **Shadow Grader** | 异步 LoRA 语义分，不阻断；见 shadow-grader runbook / CLI |

二者独立 env；hard 门禁签字 **不依赖** Shadow Grader promotion。

## 7. CLI 速查

```bash
tripnara harness kernel-hard status --token "$ADMIN_DIAGNOSTICS_TOKEN"
tripnara harness kernel-hard status --json
```

## 8. 相关测试

```bash
npm run test:kernel-hard
```

覆盖：`harness-kernel-hard-mode.util.spec.ts` · admin diagnostics 合并。

---

*维护：变更 hard 门禁语义或 sign-off 条件时，同步 [harness-production-checklist.md](./harness-production-checklist.md) §3.3 与 [harness-architecture-map.md](./harness-architecture-map.md) §5.6。*
