# ETA L2 — Phase Gate

**日期：** 2026-07-18  

| 工作项 | 状态 |
|--------|------|
| `ETA-L2-PROD-01` | **ENGINEERING COMPLETE** |
| `ETA-L2-CANARY-01` | **ICELAND OUTCOME EVIDENCE: PENDING** |
| `ETA-L2-EXECUTION-ACTUAL-01` | **ACTIVE**（执行确认对账；非导航） |

`ETA-L2-FIELD-READY-01` 已更名为上项，口径从「现场 GPS 采集」收为「行程执行 Actual」。

---

## 正式结论

```text
ENGINEERING COMPLETE
AUTHORITY CANARY ACTIVE
EXECUTION ACTUAL CAPTURE: IN PROGRESS
ICELAND OUTCOME EVIDENCE: PENDING
DEFAULT CUTOVER: NO-GO
```

| 层面 | 状态 |
|------|------|
| Base / Geometry / L2 / Selected Trips / userEvidence / 安全门禁 | ✅ |
| 执行确认 Actual 闭环 | ⏳ 契约已冻，执行页待接 |
| 冰岛真实效果 | ⏳ |
| `iceland_canary_5%` / `iceland_default` | ❌ NO-GO |

---

## 规划侧冻结

不堆 F 路规则、不调缓冲系数、不扩路网/POI、天气不进 L2、国内驾驶不证冰岛 MAE、模板跑通不升 5%。

---

## 当前工作包：`ETA-L2-EXECUTION-ACTUAL-01`

最小闭环：

```text
SEGMENT_DEPARTED（冻 travelEtaSnapshot）
→ 可选 NON_DRIVING_STOP_RECORDED
→ SEGMENT_ARRIVED
→ Actual → VALID? → Reconciliation
```

| 交付 | 路径 |
|------|------|
| 工作包说明 | `ops/ETA_L2_EXECUTION_ACTUAL_01.md` |
| **iOS 接入 / 接口说明** | `ops/ETA_L2_IOS_EXECUTION_ACTUAL.md` |
| P0 执行事件 | `contracts/travel-eta-field-events.contract.ts` |
| Actual + 质量 | `contracts/travel-eta-actual.contract.ts` |
| 对账 | `contracts/travel-eta-reconciliation.contract.ts` |
| Pilot | `ops/ETA_L2_PILOT_CHECKLIST.md` |
| 前端两类证据 | `ops/TRAVEL_ETA_FE_EVIDENCE.md` |

**明确非目标：** 实时导航、诱导、偏航重算、动态 ETA、强制全程 GPS、轨迹重建。

---

## Selected Trips

| 行程 | tripId | 角色 |
|------|--------|------|
| 冰岛南岸 | `5945a3ab-75d2-4911-ae82-9647c8c29e96` | 铺装对照 |
| 冰岛内陆高地F路 5天模板 | `15a7f7aa-d26b-41ff-ba94-b3de488214f3` | 高地对照 |

```bash
npm run lab:eta-l2-sync-authoritative-eta
npm run lab:eta-l2-canary-dashboard
npm run lab:eta-l2-default-gate-review
```

```text
shadow → selected_trips → iceland_canary_5% → iceland_canary_20% → iceland_default
```

国内只验证「确认环」；冰岛才验证 Planning 是否更准。
