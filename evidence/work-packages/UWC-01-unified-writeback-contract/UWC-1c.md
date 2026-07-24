# UWC-1c — ExpectedWriteVersion OCC

**Status:** DONE (code gate)  
**AUTHORITATIVE:** still **FORBIDDEN** (switch gate not authorized)

## Dual gates

| Gate | Constant | After UWC-1c |
|------|----------|--------------|
| Code complete | `UWC_1C_OCC_CODE_COMPLETE` | **true** |
| Switch authorized | `UWC_1C_OCC_SWITCH_AUTHORIZED` | **false** |
| Effective unlock | `UWC_1C_OCC_UNLOCKED` | **false** |

## Contract

- Discriminated `ExpectedWriteVersion`: `PLAN_VERSION` | `RESOURCE_VERSION_SET` | `NO_VERSION_REQUIRED`
- Corridor OCC strategies (not optional dual strings / not TravelContext SSOT)
- `mixedTargets` → per-WriteTarget OCC kind via `resolveWriteTargetOccKind`
- Atomic decision: **idempotency → ALREADY_APPLIED before freshness**; else VERSION_CONFLICT / PROCEED
- No check-then-write: simulator `OccAtomicWriteSimulator.tryAtomicWrite` single critical section

## Shadow hooks

`beginCapture` (pre-legacy write) → Legacy write → `completeCapture` (reconcile)  
UWC still **zero business writes**.

## Concurrency proofs

Three suites (UNIFIED / ITINERARY_ADJUST / ACTIONS_COMMIT): same old expected version, different idempotency keys → **≤1 PROCEED**, rest **VERSION_CONFLICT**; winner replay → **ALREADY_APPLIED**.

## Next

**UWC-1d** rollback / compensation contract — then canary discussion. Do **not** flip switch gate here.
