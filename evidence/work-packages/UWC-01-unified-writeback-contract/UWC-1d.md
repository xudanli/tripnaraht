# UWC-1d — Recovery / Compensation Contract

**Status:** DONE (contract) + **UWC-COMP-UNLOCK-01** (exec authorized)  
**Compensation exec:** **ALLOWED** (`UWC_1D_COMPENSATION_EXEC_AUTHORIZED=true`)  
**Write AUTHORITATIVE:** unlocked (see UWC-OCC-UNLOCK-01)

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

Shadow default: `shadowOnly=true` still yields decision-only (`SHADOW_ONLY_NO_WRITE`).  
Exec path: `shadowOnly=false` + authorized → `COMPENSATION_APPLIED`.

## Still excluded from clients

UWC-1e `autoUndo=false` · `auto_compensation` excluded capability · no page Apply.

## Next

Confirm multi-instance live proof; do not expand external compensation surfaces without a new decision.
