# UWC-1d — Recovery / Compensation Contract

**Status:** DONE (contract + Shadow decision path)  
**Compensation exec:** **FORBIDDEN** (`UWC_1D_COMPENSATION_EXEC_AUTHORIZED=false`)  
**Write AUTHORITATIVE:** still locked (1c dual gates)

## Two layers

| Layer | Meaning |
|-------|---------|
| `TRANSACTION_ABORT` | Fail before effective; unwind in-flight only |
| `POST_EFFECTIVE_COMPENSATING_WRITE` | Reverse-diff vs **current** version through full write gates |

**Forbidden:** universal Rollback bus · restore old snapshot · silent history rewrite

## Recovery Profiles

| Corridor | Capabilities |
|----------|----------------|
| ACTIONS_COMMIT | `NO_EFFECTIVE_SIDE_EFFECT` + external unsupported; no post-effective reverse write |
| ITINERARY_ADJUST | Reverse-diff `ItineraryItem` / `Trip` |
| UNIFIED_EXECUTE | Reverse-diff `PlanVersion` / `Trip` / `ItineraryItem` |

External hotel/activity/car/refund/ticketing → `EXTERNAL_COMPENSATION_UNSUPPORTED`

## Pipeline stages

Authority → Verification → Idempotency (ALREADY_APPLIED first) → OCC → Atomic Write → Audit  

Version drift → **COMPENSATION_CONFLICT** (never overwrite later edits)

## Cutover Gate (post-1d)

Order: **ACTIONS_COMMIT** (PENDING_CANARY_REVIEW) → ITINERARY_ADJUST (blocked) → UNIFIED_EXECUTE (blocked)  

Do **not** auto-unlock all three. Next review: ACTIONS_COMMIT Canary only.

## Next

ACTIONS_COMMIT Canary review → then UWC-1e protocol / further cutover. Compensation exec gate stays closed until explicit auth.
