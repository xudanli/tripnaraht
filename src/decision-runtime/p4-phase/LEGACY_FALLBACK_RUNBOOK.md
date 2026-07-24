# LEGACY_FALLBACK 回滚 Runbook

> **Companion：** [CANONICAL_DEFAULT_PRODUCTION_FLIP.md](./CANONICAL_DEFAULT_PRODUCTION_FLIP.md) · [DECISION_RUNTIME_ENV.md](../DECISION_RUNTIME_ENV.md)  
> **Drill：** `npm run p4-legacy-fallback:drill` → `artifacts/p4-legacy-fallback-drill/report.json`

## 1. 三级回滚模型

| Tier | 名称 | 场景 | Effective Plan 写入 | 重启 |
|------|------|------|---------------------|------|
| **A** | `LEGACY_FALLBACK` | 优化层异常；保留 Canonical runtime + execute | 是 | 是 |
| **B** | `CANONICAL_SELECTIVE` | Canonical execute / 约束 ON 风险；回到 SHADOW + ON_FOR_SELECTED | 否 | 是 |
| **C** | `LEGACY_DEFAULT` | 全面故障；完全 legacy authority | 否 | 是 |

推断逻辑：`legacy-convergence.evaluator.ts` · `inferLegacyConvergenceStage()`

## 2. Tier A — LEGACY_FALLBACK（首选软回滚）

**何时用：** CP-SAT / Lex 实验扰动、优化超时；Canonical 约束与 execute 仍可信。

```bash
# 应用 env（ConfigMap / .env.production）
DECISION_RUNTIME_MODE=CANONICAL
OPTIMIZATION_STRATEGY_MODE=LEGACY
CONSTRAINT_GATEWAY_MODE=ON
CANONICAL_FULL_PLAN_SELECTION=1
CANONICAL_EXECUTION_ENABLED=1
```

或脚本：

```bash
bash scripts/decision-runtime/rollback-tier-a-legacy-fallback.sh
```

**验证：**

```bash
curl -s localhost:3000/api/decision-engine/v1/runtime-capabilities \
  | jq '.data | {mode, optimizationStrategyMode: .optimizationStrategyMode, legacyConvergence}'
# expect mode=CANONICAL, stage=LEGACY_FALLBACK
```

## 3. Tier B — CANONICAL_SELECTIVE（推荐生产紧急回滚）

**何时用：** Canonical execute 写行程异常、约束 DEFAULT_ON 误判、需立即停止 Effective Plan 写入。

```bash
DECISION_RUNTIME_MODE=SHADOW
CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED
CONSTRAINT_GATEWAY_ON_SCENARIOS=iceland-road-closed,weather-outdoor-storm,daily-load-excessive,in-trip-replan,full-plan-selection,guide-plan-selection,opening-hours-conflict
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
DECISION_TRIGGER_GATEWAY_ENABLED=1
REPLANNING_TRIGGER_POLICY_ENABLED=1
BOUNDED_LNS_REPAIR_ENABLED=1
AUTHORIZATION_POLICY_GATEWAY_ENABLED=1
DECISION_PACK_RULES=1
CANONICAL_FULL_PLAN_SELECTION=0
CANONICAL_EXECUTION_ENABLED=0
OPTIMIZATION_STRATEGY_MODE=AUTO
LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE
```

或脚本：

```bash
bash scripts/decision-runtime/rollback-tier-b-canonical-selective.sh
npm run p4-selective:staging
```

**验证：** `mode=SHADOW`, `constraintGatewayOnForSelected=true`, `fullPlanSelection=false`

## 4. Tier C — LEGACY_DEFAULT（最后手段）

**何时用：** Gateway / Canonical 全链路不可用；恢复已知稳定的 legacy boolean。

```bash
DECISION_RUNTIME_MODE=LEGACY
CONSTRAINT_GATEWAY_MODE=OFF
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=0
CANONICAL_FULL_PLAN_SELECTION=0
CANONICAL_EXECUTION_ENABLED=0
DECISION_TRIGGER_GATEWAY_ENABLED=0
REPLANNING_TRIGGER_POLICY_ENABLED=0
AUTHORIZATION_POLICY_GATEWAY_ENABLED=0
OPTIMIZATION_STRATEGY_MODE=AUTO
```

或脚本：

```bash
bash scripts/decision-runtime/rollback-tier-c-legacy-default.sh
```

## 5. 演练（sign-off 前必跑）

```bash
# 离线 tier 推断
npm run p4-legacy-fallback:drill

# 可选：对已运行实例做 capabilities 快照
npm run p4-legacy-fallback:drill -- http://localhost:3001/api
```

期望：`drillPass=true`，三级 stage 分别为 `LEGACY_FALLBACK` / `CANONICAL_SELECTIVE` / `LEGACY_DEFAULT`。

## 6. 回滚后沟通模板

```
[Decision Runtime Rollback]
Tier: B — CANONICAL_SELECTIVE
Time: <UTC>
Trigger: <metric / incident>
Effective plan writes: STOPPED (SHADOW)
Next: root cause in <ticket>; re-flip after p4-production-flip:advisory PASS
```

## 7. On-call checklist

- [ ] 选定 Tier（默认 B，优化-only 用 A，全挂用 C）
- [ ] 更新 ConfigMap / 重启 Pod
- [ ] `runtime-capabilities` 确认 stage
- [ ] `p4-selective:staging`（Tier B）或 health check（Tier C）
- [ ] 通知 #incident + 更新 advisory 签字表
- [ ] 事故后跑 `p4-legacy-fallback:drill` + `p4-production-flip:advisory`

---

*Version: legacy-fallback-runbook@v1 · P4 Legacy convergence*
