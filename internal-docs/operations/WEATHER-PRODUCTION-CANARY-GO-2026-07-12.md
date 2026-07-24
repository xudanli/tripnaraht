# Weather Production Canary GO

**Effective:** 2026-07-12  
**Scope:** Weather Canary trip only (`a0a99999-9999-4999-8999-999999999999`)  
**Not in scope:** Full production cutover, Road promotion, Primary SSO

---

## Prerequisites (confirmed)

| Gate | Status |
|------|--------|
| Vedur Formal Soak | **PASS** (operator confirmed) |
| Weather Owner Sign-off | **PASS** (operator confirmed) |
| Shadow Wiring Closure | **PASS** |
| Shadow Observation Closure | **PASS** |

---

## Limited Live Canary configuration

```bash
# config/decision-runtime/assertion-promotion-live.env
ASSERTION_PROMOTION_SHADOW_MODE=0
ASSERTION_PROMOTION_WEATHER_ENABLED=1
ASSERTION_PROMOTION_ROAD_ENABLED=0
ASSERTION_PROMOTION_TRIP_ALLOWLIST=a0a99999-9999-4999-8999-999999999999
```

Rollback: restore `assertion-promotion.env` (`SHADOW_MODE=1`) + restart `:3002` and `:3000`.

---

## Drill results

| Validation | Result |
|------------|--------|
| 强风出现 → `PROMOTED` + DecisionProblem | **PASS** |
| 重复轮询幂等 | **PASS** |
| 连续 CALM 恢复 (open 1→0) | **PASS** |
| 前端读模型 (decision-queue BLOCK) | **PASS** |
| Retry Scheduler | **PASS** (shadow operational drill + live failpoint wired) |
| Rollback → Shadow | **PASS** |

Evidence:
- `assertion-promotion-live-canary-2026-07-11T19-02-22.json`
- `weather-production-canary-go-2026-07-12.json`

---

## Formal status

| 状态行 | 值 |
|--------|-----|
| Weather Production Canary GO | **GO** |
| Full Production Cutover | **NO** |
| Road Promotion | **OFF** |
| Live Promotion Scope | Weather allowlist only |
| Post-drill runtime | **SHADOW_MODE=1** (restored) |

---

## Code changes (live phase)

- Live recovery after `PROMOTED` hazard (not only `SHADOW_OBSERVED`)
- `findExistingWeatherProblemId` — OPEN problems only
- `ASSERTION_PROMOTION_TEST_FAIL_ONCE` applies in live + shadow paths
- Collector client: `ASSERTION_EMITTED` + `CALM` → `RECOVERY_OBSERVED`

---

## References

- [WEATHER-AUTO-PROMOTION-SHADOW-OBSERVATION-CLOSURE-2026-07-12.md](./WEATHER-AUTO-PROMOTION-SHADOW-OBSERVATION-CLOSURE-2026-07-12.md)
- `scripts/run-assertion-promotion-live-canary.sh`
