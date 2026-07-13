# ADR: Assertion Auto-Promotion (Shadow Phase 1)

**Status:** Accepted — Shadow implementation  
**Wiring closure:** PASS (2026-07-12) — see [WEATHER-AUTO-PROMOTION-SHADOW-WIRING-CLOSURE-2026-07-12.md](../operations/WEATHER-AUTO-PROMOTION-SHADOW-WIRING-CLOSURE-2026-07-12.md)  
**Observation closure:** PASS (2026-07-12)  
**Live canary:** GO (2026-07-12) — see [WEATHER-PRODUCTION-CANARY-GO-2026-07-12.md](../operations/WEATHER-PRODUCTION-CANARY-GO-2026-07-12.md)  
**Date:** 2026-07-12  
**Scope:** Monitoring layer only; frozen Weather/Road Runtime unchanged

## Context

Collector `ASSERTION_EMITTED` writes `rfc001WorldState` but does not promote to `rfc001DecisionProblems`. Frontend APIs read the Problem layer. Manual `monitoring/scan` is trip-wide, may re-resolve via Open-Meteo when Gateway is ON, and lacks assertion-level idempotency.

## Decision

Introduce **AssertionPromotionService** in `decision-runtime/monitoring/`:

1. **Promotion Ledger** (`rfc001AssertionPromotionLedger` on trip.metadata)
2. **Stable `promotionKey`** (road/day semantic scope — not per-poll `eventId`)
3. **Postgres advisory lock** per trip (`pg_advisory_xact_lock(hashtext(tripId))`)
4. **`runFromResolvedEvidence`** when live promotion is enabled (no second `EvidenceResolver`)
5. **Shadow default (Phase 1):** dry-run impact + ledger only — **no** pipeline/runner/problem upsert
6. **Signals:**
   - `ASSERTION_EMITTED` — hazard assertion → pipeline path
   - `RECOVERY_OBSERVED` — independent calm/open recovery (not inferred from emit alone)
7. **Triggers:**
   - Real-time: `:3000` collector → `POST :3002/api/internal/monitoring/promote-assertion`
   - Retry: 5-minute scheduler over ledger `FAILED` entries
   - Fallback: `monitoring/scan` → `reconcileTripAssertions`

## Phase 1 constraints

| Item | Phase 1 |
|------|---------|
| Trip allowlist | Weather Canary `a0a99999-9999-4999-8999-999999999999` only |
| Mode | `ASSERTION_PROMOTION_SHADOW_MODE=1` (default) |
| Road promotion | Disabled (`ASSERTION_PROMOTION_ROAD_ENABLED=0`) |
| Visible queue / W-01 / notifications | **Not modified** |
| Frozen Runtime (detection/pipeline/runner) | **Not modified** |

## Promotion keys

```
weather:hazard:day:{dayIndex}:WEATHER_ACTIVITY_PROHIBITED
weather:recovery:day:{dayIndex}:RECOVERY_OBSERVED
road:hazard:{roadId}:ROAD_SEGMENT_UNAVAILABLE        # Phase 2
road:recovery:{roadId}:RECOVERY_OBSERVED             # Phase 2
```

## Idempotency boundaries

| Layer | Key |
|-------|-----|
| Collector ingest | `requestId` (replay ledger) |
| Promotion | `promotionKey` + `signal` + ledger status |
| Problem (live only) | `findOpenByTriggerEvent` + `findExistingWeatherProblemId` |

## Environment

```bash
ASSERTION_PROMOTION_ENABLED=1
ASSERTION_PROMOTION_SHADOW_MODE=1          # Phase 1 default
ASSERTION_PROMOTION_WEATHER_ENABLED=1
ASSERTION_PROMOTION_ROAD_ENABLED=0         # Phase 2
ASSERTION_PROMOTION_TRIP_ALLOWLIST=a0a99999-9999-4999-8999-999999999999
ASSERTION_PROMOTION_INTERNAL_SECRET=...    # :3002 internal endpoint
ASSERTION_PROMOTION_BASE_URL=http://127.0.0.1:3002
ASSERTION_PROMOTION_RETRY_INTERVAL_MS=300000
ASSERTION_PROMOTION_MAX_ATTEMPTS=5
```

## Non-goals (Phase 1)

- Production canary visible queue cutover
- Road live cron / Road canary promotion
- Modifying `DecisionProblemDetectorService` or unified read model filters
