# ITINERARY Canary — Ops Run Log

**Corridor:** ITINERARY_ADJUST  
**Runbook step:** 2  
**Status:** **PASSED** — cutover advanced 2026-07-24

## Result

```ts
advanceCutoverAfterItineraryCanaryPass();
```

| Corridor | Status |
|----------|--------|
| ACTIONS_COMMIT | `CANARY_APPROVED` |
| ITINERARY_ADJUST | **CANARY_PASSED** (`CANARY_APPROVED`) |
| UNIFIED_EXECUTE | **PENDING_CANARY_REVIEW** |

Locks unchanged: `UWC_1C_OCC_UNLOCKED=false`, compensation `false`.  
UNIFIED traffic still gated (not `APPROVED_FOR_CANARY`).

## Prior evidence

- Frozen scope lab probe `ITINERARY_LAB_PROBE_OK`  
- Ops sign-off: **confirmed** 2026-07-24  

## Next (runbook step 3)

```ts
approveUnifiedExecuteForCanary();
// env: AUTHORIZED=1, KILL=0, PERCENT=0, trip allowlist, OP=verified_plan_version_only
beginUnifiedExecuteCanary();
```

See `CANARY_OPS_RUNBOOK.md` §3.
