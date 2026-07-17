# M4-RA-01A — Pilot Preflight

> 除**真实白名单 tripId**与**产品最终签字**外，发布准备全部做完。  
> 数据一到 → 进入 Rollback Drill + `selected_trips`（**M4-RA-01B**），不再等工程开发。

## 完成口径

| 维度 | 目标状态 |
|------|----------|
| Engineering | READY |
| Pilot Preflight | READY |
| Product Policy | READY_FOR_APPROVAL |
| Dataset | WAIT（真实 10 条；synthetic 仅密封机制） |
| Release | BLOCKED |

## 本包交付

| # | 项 | 路径 / 命令 |
|---|----|-------------|
| 1 | Dataset Schema Freeze | `lab/selected-trips/DATASET_SCHEMA.md` |
| 2 | Validate CLI | `npm run lab:validate-selected-trip -- --tripId …` |
| 3 | Intake / Export | `npm run lab:export-selected-trip` / `lab:import-selected-trip` |
| 4 | Assemble | `npm run lab:assemble-selected-pilot` → eligible / blocked |
| 5 | Sampling policy | `SELECTED_TRIP_SAMPLING_POLICY.md` |
| 6 | Product template | `planning-signoff/PRODUCT_APPROVAL_TEMPLATE.md` |
| 7 | Test authority (非生产) | `planning-signoff/authority.test.json` |
| 8 | Fault injection | `rollback-fault-injection.spec.ts` |
| 9 | Dashboard audit fields | `ortools-canary-dashboard.metrics.ts` |
| 10 | Preflight board | `npm run lab:pilot-preflight-status` |
| 11 | **Evaluate 主链接线** | `wireOrtToolsEvaluateCanary` → scoped provider + `dashboard.record`；Release 授权且白名单/scope 命中时才 merge Gateway-PASS 候选 |
| 12 | Fault injection + seal | `rollback-fault-injection.spec.ts` · `lab:seal-rollback-drill` |
| 13 | Go/No-Go + Kill SOP | `npm run lab:go-no-go` · [`CANARY_ROLLBACK_SOP.md`](./CANARY_ROLLBACK_SOP.md) |
| 14 | Authorize/Execute 硬拦 + PlanVersion 幂等 | `ortools-canary-authorization.guard` · createPending idempotent |

## 预演（机制，非产品签核）

```bash
# 用 gold staging 冻结核销包
npm run lab:export-selected-trip -- --from-gold iceland.road_close.01_f208_reroute_a1_a2
npm run lab:validate-selected-trip -- --tripId pilot_iceland_road_close_01_f208_reroute_a1_a2
npm run lab:assemble-selected-pilot

# 故障注入
npx jest src/decision-runtime/solver/lab/planning-signoff/rollback-fault-injection.spec.ts

npm run lab:pilot-preflight-status
```

**禁止**把 `authority.test.json` 的 APPROVED 抄进生产 `authority.json`。

## RA-01B（数据到位后）

导入 10 条 → 复核 expected-outcome → whitelist → 产品 APPROVED → mint token → 运行态 Rollback Drill → `selected_trips`。

**测试阶段无生产流量时怎么造数：** [DATA_INTAKE_REQUIREMENTS.md](./lab/selected-trips/DATA_INTAKE_REQUIREMENTS.md)
