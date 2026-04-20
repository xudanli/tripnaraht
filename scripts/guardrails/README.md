# scripts/guardrails

TripNARA **Phase A** 轻量守卫脚本入口；与 `docs/TRIPNARA_ENGINEERING_GUARDRAILS.md`、`.tripnara-guardrails/` 配套。

## 命令

```bash
npm run guardrails:check       # DSO 直写启发式
npm run guardrails:executor    # Executor 纯度（F2）
npm run guardrails:all         # 以上两者
```

## CI（非阻断）

工作流：`.github/workflows/guardrails-smoke.yml` — 在 **pull_request** 上运行 `guardrails:all`，`continue-on-error: true`，并在 Job Summary 里留下结果，便于收集误报。

## 脚本说明

| 脚本 | 作用 | 严格度 |
|------|------|--------|
| `check-dso-mutation-smoke.ts` | 启发式扫描 `dso.` 赋值（排除 StateManager） | 默认 **warn**；`GUARDRAILS_STRICT=1` 时 exit 1 |
| `check-executor-purity-smoke.ts` | F2：execution 下 executor 禁止 persistence/HTTP 等 import | 同上 |

后续可追加：`check-arch-boundaries`（dependency-cruiser）、ESLint 自定义规则。

## 运行时：DONE 响应完整性

`src/agent/guards/done-response-completeness.guard.ts` — 在 `RouteAndRunResponseAssemblerService.assembleClaudeStateMachineResponse` 出口调用。

| 变量 | 含义 |
|------|------|
| `DECISION_DONE_COMPLETENESS_STRICT` | `1` 时缺失 result/verification/explain/dso_version 则 **抛错**；默认仅 `console.warn` |

## 环境变量（静态脚本）

| 变量 | 含义 |
|------|------|
| `GUARDRAILS_STRICT` | 设为 `1` 时，DSO/Executor 启发式命中则使 **脚本** exit 1 |
