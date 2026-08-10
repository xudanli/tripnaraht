# UWC-CANARY-01 — ACTIONS_COMMIT AUTHORITATIVE_CANARY

**Status:** **FROZEN** — do not expand corridor  
**Ops:** **CANARY_IN_PROGRESS** (finish this canary first)  
**Scope:** ACTIONS_COMMIT only  

## Admission (frozen)

- `NO_EFFECTIVE_SIDE_EFFECT`
- No external side effects / locks / holds
- No PlanVersion / Trip / ItineraryItem writes
- Default allowlist: `execution.remind` (override `UWC_ACTIONS_CANARY_ACTION_ALLOWLIST`)

## Controls

| Control | Env / constant |
|---------|----------------|
| Authorize | `UWC_ACTIONS_CANARY_AUTHORIZED=1` |
| Kill switch | `UWC_ACTIONS_CANARY_KILL_SWITCH=1` |
| Percent | `UWC_ACTIONS_CANARY_PERCENT=0..100` |
| Allowlist | `UWC_ACTIONS_CANARY_ACTION_ALLOWLIST` |

Independent of global `UWC_1C_OCC_UNLOCKED` and `UWC_1D_COMPENSATION_EXEC_AUTHORIZED` (both remain false).

## Execution rule

- **Selected:** UWC only — **no dual execution** with Legacy  
- **Not selected:** Legacy + Shadow reconcile  
- **Fallback to Legacy:** only technical exception **before** any side effect  
- **No fallback** on CONFLICT / REJECTED / VERIFICATION_REQUIRED / AUTHORITY_DENIED  

## Cutover (on pass)

```ts
advanceCutoverAfterActionsCanaryPass();
```

→ ACTIONS **CANARY_PASSED** (`CANARY_APPROVED`), ITINERARY `PENDING_CANARY_REVIEW`, UNIFIED **BLOCKED**.

See `CANARY_OPS_RUNBOOK.md`.
