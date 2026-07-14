# Planning Engine Roadmap（TripNARA）

> **判定（2026-07-15）**  
> **Planning Runtime Phase 0–P6 工程能力 = READY（Shadow）**  
> **当前工作项：M4-RA-01A Pilot Preflight**（数据到达前把机制清零）  
> Authoritative = **Release Authorization**（不是扩算法 / 不是加金样）

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

## 当前优先级：M4-RA-01A Pilot Preflight

**做：** Dataset schema/校验/导入、fault injection、看板审计字段、产品政策模板、选样政策  
**不做：** 扩算法、加金样、假批生产 `authority.json`、开真实 canary

```bash
npm run lab:export-selected-trip -- --from-gold iceland.road_close.01_f208_reroute_a1_a2
npm run lab:validate-selected-trip -- --tripId <id>
npm run lab:assemble-selected-pilot
npm run lab:pilot-preflight-status
npm run lab:go-no-go
# Kill-switch: solver/CANARY_ROLLBACK_SOP.md
```

| 维度 | 状态 |
|------|------|
| Engineering | READY |
| Pilot Preflight | READY（含 evaluate 主链 canary wire） |
| Product Policy | READY_FOR_APPROVAL |
| Dataset | WAIT（真实 10 条） |
| Release | BLOCKED |

详见：[M4-RA-01A](./solver/M4_RA_01A_PILOT_PREFLIGHT.md) · [M4-RA-01B](./solver/M4_RA_01_SELECTED_TRIPS_PILOT.md)

## Milestones

| ID | 名称 | 状态 |
|----|------|------|
| M1–M3 / P0–P6 | Shadow Runtime + Canary 脚手架 | **READY** |
| **M4-RA-01A** | Pilot Preflight | **IN PROGRESS** |
| **M4-RA-01B** | Selected Trips Execution | **WAIT**（真实数据） |
| M4 5%+ | Percent canary | **NOT STARTED** |

## 正式状态陈述

TripNARA Planning Runtime 已完成 Phase 0–P6 工程能力建设。OR-Tools 作为非权威候选生成器稳定接入主链。当前阻塞 Authoritative 的原因是 **Release Governance**，不是算法缺口。下一项是 **M4-RA-01**：在受限 operation scope 与白名单行程上开展 Controlled Authoritative Canary，Decision Runtime 仍为最终验证与写入权威。
