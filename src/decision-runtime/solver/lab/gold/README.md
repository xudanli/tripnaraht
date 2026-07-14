# Planning Gold Dataset（P0）

> 真实场景金样库 — **求解器无关**的统一验收底座。  
> 服务于 Routing / 未来 CP-SAT / Hexaly 等任意实现。  
> **不晋升权威**；`authoritativePromotion` 恒为 false。

## 目标规模（Iceland 优先）

| 族 | 目标条数 | 状态 |
|----|----------|------|
| Road Close | 10 | **10/10 active**（synthetic_template_v1） |
| Wind | 10 | **10/10 active**（synthetic_template_v1） |
| Blue Ice / 冰川可达 | 10 | **10/10 active**（synthetic_template_v1） |
| Parking Full | 10 | **10/10 active**（synthetic_template_v1） |
| Hotel Change | 10+ | **15 active**（10 单日 proxy + 5 MOVE_DAY 多日） |
| Reservation Delay | 10 | **10/10 active**（synthetic_template_v1） |
| **合计** | **65+ / 100+** | 5× `staging_replay`（M4 real_gold 门槛）；其余 synthetic |

每一次 Solver 升级必须 **Replay** 本目录全部 `status: active` 场景。

## 场景文件

路径：`scenarios/<country>/<family>/<id>.scenario.json`  
清单：`manifest.v1.json`

最小字段见 `gold-scenario.schema.md`。当前 demo：

- `scenarios/iceland/road_close/01_…` … `10_…`
- `scenarios/iceland/wind/01_…` … `10_…`
- `scenarios/iceland/blue_ice|parking_full|hotel_change|reservation_delay/01_…` … `10_…`  
  （见 `COLLECTION_CHECKLIST.md`）

## Replay

```bash
# sidecar 需已启动
OR_TOOLS_SOLVER_URL=http://127.0.0.1:8091 \
  npx tsx src/decision-runtime/solver/lab/gold/replay-gold-dataset.ts
```

断言（Phase 0）：
- `nativeCpSat === false`（Routing 路径）
- status ∈ SOLVED|PARTIAL|TIMEOUT|INFEASIBLE（非 ERROR）
- Candidate Stability（固定 seed × N）可选 `--stability 20`
- Repair Locality：`changedActivityCount ≤ maxChangedActivities`（若金样声明）

## 与 M4 关系

金样绿是 **M4 工程门槛的必要非充分** 条件（Production Baseline）。  
Authoritative 另需 [Release Governance](../../AUTHORITY_CANARY.md) — 见 `npm run lab:authority-readiness`。
