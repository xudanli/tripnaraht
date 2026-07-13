# Weather Auto-Promotion Shadow Observation Closure

**Effective:** 2026-07-12  
**Verdict:** **Weather Auto-Promotion Shadow Observation Closure = PASS**

Prior wiring closure: [WEATHER-AUTO-PROMOTION-SHADOW-WIRING-CLOSURE-2026-07-12.md](./WEATHER-AUTO-PROMOTION-SHADOW-WIRING-CLOSURE-2026-07-12.md)

---

## Observation closure status

| 状态行 | 当前值 |
|--------|--------|
| Weather Shadow Wiring Closure | **PASS** |
| Weather Auto-Promotion Observation Closure | **PASS** |
| Weather Hazard Lifecycle Drill | **PASS** |
| Weather Recovery Shadow Closure | **PASS** |
| Retry Scheduler Wiring | **PRESENT** |
| Retry Scheduler Operational Drill | **PASS** |
| `ASSERTION_PROMOTION_SHADOW_MODE` | **1** |
| Live Promotion | **OFF** |
| Road Promotion | **OFF** |
| Visible Queue Impact | **ZERO** |
| DecisionProblem Writes | **ZERO** |

---

## Drill 1 — Hazard Lifecycle (dayIndex=5)

受控 fixture `VEDUR_REAL_PAYLOAD_REPLAY`，完整生命周期：

```
CALM → STRONG_WIND (93.6 km/h) → duplicate → CALM #1 → CALM #2
```

| 阶段 | 实测 |
|------|------|
| 初始 CALM | `RECOVERY_SHADOW` (`weather:recovery:day:5`) |
| 首次强风 | `SHADOW_OBSERVED` + assertionId/eventId |
| 重复强风 | hazard ledgerId 不变，ingest `SILENT` |
| CALM #1 | `calmStreak=1`，recovery ledger 更新 |
| CALM #2 | `RECOVERY_SHADOW` `calmStreak=2` |
| 全过程 | problemCount=0，queue openCount=2 |

Evidence: `assertion-promotion-observation-2026-07-11T18-47-46.json`

---

## Drill 2 — Retry Scheduler Operational (dayIndex=7)

服务端 failpoint（devbox only，默认关闭）：

```bash
ASSERTION_PROMOTION_TEST_FAIL_ONCE=1
```

| 步骤 | 实测 |
|------|------|
| POST accepted | ingest `ASSERTION_EMITTED` → promote 进入 service |
| 执行阶段失败 | `status=FAILED`, `attempts=1`, `nextRetryAt` 有值 |
| Scheduler 自动重试 | `AssertionPromotionRetryScheduler` ~20s 后重试 |
| 恢复 | `SHADOW_OBSERVED`, `attempts=2` |
| 零影响 | problemCount=0，queue 无变化 |

Evidence: `assertion-promotion-observation-2026-07-11T18-53-48.json`

---

## Implementation notes (observation phase)

- `ASSERTION_PROMOTION_TEST_FAIL_ONCE` — devbox/staging failpoint; blocked when `NODE_ENV=production`
- Post-hazard recovery cycle — `RECOVERY_OBSERVED` 在 hazard `SHADOW_OBSERVED` 存在时允许 streak 续跑
- Hazard shadow 写入时重置 `recoveryStreakByDay`（非 CALM tier）
- Collector client：`ASSERTION_EMITTED` + `CALM` tier → `RECOVERY_OBSERVED` promote
- Retry success 保留 `attempts` 递增（FAILED→2 on recovery）

---

## Ledger policy

**未清除**任何历史 `rfc001AssertionPromotionLedger` 条目。Drill 使用新 `dayIndex`（5、7）与新 episode。

---

## Next gate

Observation Closure 已满足 Shadow 阶段退出标准。在此之后才讨论 **Weather 有限 Live Canary**；在此之前保持 `ASSERTION_PROMOTION_SHADOW_MODE=1`。

---

## References

- `scripts/run-assertion-promotion-observation-drills.sh`
- `config/decision-runtime/assertion-promotion-drill.env`
- Summary: `assertion-promotion-observation-closure-2026-07-12.json`
