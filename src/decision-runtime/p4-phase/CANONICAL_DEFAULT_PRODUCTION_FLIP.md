# CANONICAL_DEFAULT 生产切换计划（Change Advisory）

> **Companion：** [DECISION_RUNTIME_ENV.md](../DECISION_RUNTIME_ENV.md) · [LEGACY_FALLBACK_RUNBOOK.md](./LEGACY_FALLBACK_RUNBOOK.md)  
> **Artifacts：** `npm run p4-production-flip:advisory` → `artifacts/p4-production-flip/advisory.json`

## 1. 目标与边界

| 项 | 说明 |
|----|------|
| **目标** | 将正式路径从 `CANONICAL_SELECTIVE`（SHADOW + ON_FOR_SELECTED）升级为 `CANONICAL_DEFAULT`（`DECISION_RUNTIME_MODE=CANONICAL` + `CONSTRAINT_GATEWAY_MODE=ON`） |
| **不变** | `OPTIMIZATION_STRATEGY_MODE=AUTO`（legacy-frozen 仍为优化 Authority）；Lex 仅 SHADOW/DUAL_RUN |
| **不写 Effective Plan** | Shadow 模式永不写；CANONICAL execute 需 `CANONICAL_EXECUTION_ENABLED=1` + 授权 Gateway |

## 2. 前置门槛（全部 PASS 方可 flip）

自动化检查：

```bash
npm run p4-phase:closure                    # CANONICAL_SELECTIVE_READY
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-canonical-default:closure  # staging
npm run p4-legacy-fallback:drill            # 三级回滚 posture 验证
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=30 npm run p4-production-flip:advisory # 生产预检
```

| Gate | 要求 |
|------|------|
| selective-closure | `CANONICAL_SELECTIVE_READY` |
| staging-closure | `CANONICAL_DEFAULT_STAGING_READY` |
| constraint-7-7 | 7/7 ON_FOR_SELECTED |
| observation-window | selective closure 后 ≥30d（`CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS`） |
| legacy-fallback-drill | 三级回滚 tier 推断正确 |
| change-advisory-signed | 产品 + SRE 签字 |
| rollback-runbook-reviewed | On-call 已链接 [LEGACY_FALLBACK_RUNBOOK](./LEGACY_FALLBACK_RUNBOOK.md) |

## 3. 推荐生产 env（flip 后）

```bash
DECISION_RUNTIME_MODE=CANONICAL
CONSTRAINT_GATEWAY_MODE=ON
CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1
CANONICAL_FULL_PLAN_SELECTION=1
CANONICAL_EXECUTION_ENABLED=1
GUIDE_CANONICAL_PLAN_SELECTION=1
GUIDE_CANONICAL_ACCEPT_EXECUTE=1
AUTHORIZATION_POLICY_GATEWAY_ENABLED=1
DECISION_TRIGGER_GATEWAY_ENABLED=1
REPLANNING_TRIGGER_POLICY_ENABLED=1
BOUNDED_LNS_REPAIR_ENABLED=1
DECISION_PACK_RULES=1
OPTIMIZATION_STRATEGY_MODE=AUTO
LEGACY_CONVERGENCE_TARGET=CANONICAL_DEFAULT
EFFECTIVE_PLAN_WRITE_GUARD=1
```

**注意：** 显式设置 `DECISION_RUNTIME_MODE=CANONICAL`；勿仅依赖 `.env` 中 `DECISION_GATEWAY_UNIFIED=1`。

## 4. 分阶段 rollout

### Phase 0 — 预演（已完成）

- `:3000` selective staging — `npm run p4-selective:dev-3000`
- `:3001` canonical preview — `npm run p4-canonical-default:dev-3001`

### Phase 1 — Canary pod（10%）

1. 单 region / 单 deployment 应用 §3 env
2. 验证：`GET /api/decision-engine/v1/runtime-capabilities` → `mode=CANONICAL`, `constraintGatewayMode=ON`
3. 跑 smoke：`npm run p4-canonical-default:preview -- https://canary-api.example.com/api`

### Phase 2 — 观察 48h

监控项：

- `tripnara_constraint_shadow_compared_total` / `diverged_total`
- Canonical execute 错误率（决策 finalize / materialize）
- Holdout blind review 无劣化

### Phase 3 — 扩面 50% → 100%

- 无 rollback trigger（见 §5）则扩面
- 全量后保留 Tier B 回滚 ConfigMap 7 天

## 5. Rollback 触发条件

立即执行 [LEGACY_FALLBACK_RUNBOOK](./LEGACY_FALLBACK_RUNBOOK.md) 中 **Tier B** 或 **Tier C**：

- constraint shadow divergence rate > 2× baseline（15m 窗口）
- canonical execute 失败率 > 1%（10m）
- Effective Plan 与用户可见行程不一致（L1）
- On-call / 产品 escalation

## 6. 验证命令（flip 后）

```bash
curl -s "$API/api/decision-engine/v1/health" | jq '.data.capabilities.decisionRuntimeMode'
curl -s "$API/api/decision-engine/v1/runtime-capabilities" | jq '.data | {mode, constraintGatewayMode, fullPlanSelection}'
npm run constraint-rollout:status
CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=30 npm run p4-production-flip:advisory
```

## 8. 开发环境全流程验证（无需等待 30d）

```bash
npm run p4-flip-full-drill
# 或跳过构建、保留三台 server：
npm run p4-flip-full-drill -- --skip-build --keep-servers
```

**阶段：**

| Phase | 端口 | 内容 |
|-------|------|------|
| 1 | `:3000` | CANONICAL_SELECTIVE + staging + closure |
| 2 | `:3001` | CANONICAL_DEFAULT preview + closure |
| 3 | `:3002` | Canary flip（生产 env） |
| 4 | `:3002` | Tier B 回滚 + selective staging |
| 5 | offline | legacy-fallback drill + dev advisory |

**收口：** `artifacts/p4-flip-full-drill/report.json` → `pass=true`

## 7. 签字记录（人工）

| 角色 | 姓名 | 日期 | 签字 |
|------|------|------|------|
| Platform | | | |
| SRE / On-call | | | |
| Product | | | |

---

*Version: canonical-default-production-flip@v1 · P4 Legacy convergence*
