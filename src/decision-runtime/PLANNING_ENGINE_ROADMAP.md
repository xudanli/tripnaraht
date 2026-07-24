# Planning Engine Roadmap（TripNARA）

> **判定（2026-07-16）**  
> **Planning Runtime Phase 0–P6 = READY（Shadow）**  
> **M4-RA-01A = READY** · **Dataset READY** · **Go/No-Go = GO** · staging live drill PASS  
> **当前：可将 staging 运行态切到 `selected_trips`（见 `.staging-canary-enable.env`）**  
> Authoritative = **Release Authorization**；未开 5%+

## Official capability matrix

| 能力 | 状态 |
|------|------|
| Planning Orchestrator | ✅ Production Ready（Shadow） |
| OR-Tools Routing | ✅ Production Ready（Shadow） |
| Repair Provider | ✅ Production Ready（Shadow） |
| Planning IR | ✅ Frozen |
| Evidence Stale | ✅ Production Ready |
| MOVE_DAY | ✅ MVP（Flag Off） |
| Native CP-SAT | ✅ MVP（Flag Off） |
| Planning Gold Replay | ✅ Production Baseline |
| Authoritative Planning | 🚫 **Release Blocked** · Preflight → [M4-RA-01A](./solver/M4_RA_01A_PILOT_PREFLIGHT.md) |

### Planning Runtime

| 层 | 状态 |
|----|------|
| Generation / Optimization / Repair / Gateway / Replay | **READY** |
| Authority | **BLOCKED**（治理；工程就绪） |
| Continuous | **PLANNED** |

```
工程能力已完成 · 发布能力仍受控
Engineering READY ≠ Release AUTHORIZED
```

## 当前优先级：产品签核 → M4-RA-01B

**已做完：** RA-01A 机制 + staging 造数（`2293028143@qq.com` / `ra01_is_01`…`10`）+ live `--from-staging` 导出 + Dataset READY + whitelist 草案  
**不做：** 扩算法、假批生产 `authority.json`、开真实 canary  
**下一步：** 产品填 accountability 并 APPROVE → mint token → Rollback Drill → `OR_TOOLS_CANARY_STAGE=selected_trips`

```bash
npm run lab:export-selected-trip -- --from-staging --prefix ra01_is_ --deidentify
npm run lab:assemble-selected-pilot
npm run lab:pilot-preflight-status
npm run lab:go-no-go
# Kill-switch: solver/CANARY_ROLLBACK_SOP.md
```

| 维度 | 状态 |
|------|------|
| Engineering | READY |
| Pilot Preflight | READY |
| Product Policy | READY_FOR_APPROVAL |
| Dataset | **READY**（10 real staging_export） |
| Whitelist | 草案已填 `ra01_is_01`…`10`（待产品确认） |
| Release | BLOCKED |

详见：[M4-RA-01A](./solver/M4_RA_01A_PILOT_PREFLIGHT.md) · [M4-RA-01B](./solver/M4_RA_01_SELECTED_TRIPS_PILOT.md)

## Milestones

| ID | 名称 | 状态 |
|----|------|------|
| M1–M3 / P0–P6 | Shadow Runtime + Canary 脚手架 | **READY** |
| **M4-RA-01A** | Pilot Preflight | **READY**（Dataset READY · 10 staging_export） |
| **M4-RA-01B** | Selected Trips Execution | **GO（就绪）** — 待 staging 运行态加载 canary env |
| M4 5%+ | Percent canary | **NOT STARTED** |

## 正式状态陈述

TripNARA Planning Runtime 已完成 Phase 0–P6 工程能力建设。OR-Tools 作为非权威候选生成器稳定接入主链。当前阻塞 Authoritative 的原因是 **Release Governance**，不是算法缺口。下一项是 **M4-RA-01**：在受限 operation scope 与白名单行程上开展 Controlled Authoritative Canary，Decision Runtime 仍为最终验证与写入权威。
