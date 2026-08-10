# UWC-CANARY-02 — ITINERARY_ADJUST AUTHORITATIVE_CANARY

**Status:** **FROZEN** — do not expand scope  
**Ops:** **CODE_COMPLETE** — wait for ACTIONS pass → `PENDING_CANARY_REVIEW`  
**Scope:** ITINERARY_ADJUST first round only  

**Prerequisite:** ACTIONS canary pass → `advanceCutoverAfterActionsCanaryPass()` → then `beginItineraryAdjustCanary()`.

## Admission (frozen)

- Unbooked, unlocked, **no external side effects**
- **Same-day time adjust only** (`same_day_time_adjust`)
- WriteTargets: **Trip** + **ItineraryItem** only
- Reject: `append_sparse_days`, add/delete day replace, booked/paid/locked items, product bindings

## Controls (independent)

| Control | Env |
|---------|-----|
| Authorize | `UWC_ITINERARY_CANARY_AUTHORIZED=1` |
| Kill switch | `UWC_ITINERARY_CANARY_KILL_SWITCH=1` |
| Percent | `UWC_ITINERARY_CANARY_PERCENT=0..100` |
| Trip allowlist | `UWC_ITINERARY_CANARY_TRIP_ALLOWLIST` |
| Op allowlist | `UWC_ITINERARY_CANARY_OP_ALLOWLIST` (default `same_day_time_adjust`) |

Global AUTHORITATIVE and compensation exec remain **LOCKED**.

## Execution rule

- **Selected:** UWC only — DB `$transaction` + RESOURCE_VERSION_SET OCC — no dual execution  
- **Not selected:** Legacy + Shadow  
- No fallback on CONFLICT / REJECTED / VERIFICATION_* / AUTHORITY_DENIED  
- Compensation exec closed — TRANSACTION_ABORT only  

## Cutover

```ts
beginItineraryAdjustCanary();
// …ops pass…
advanceCutoverAfterItineraryCanaryPass();
```

→ ITINERARY **CANARY_PASSED**, UNIFIED `PENDING_CANARY_REVIEW`.

See `CANARY_OPS_RUNBOOK.md`.
