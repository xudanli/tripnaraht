# UWC-CANARY-03 — UNIFIED_EXECUTE AUTHORITATIVE_CANARY

**Status:** **FROZEN** — do not expand UNIFIED_EXECUTE beyond PlanVersion-only  
**Ops:** **CODE_COMPLETE + TRAFFIC_GATED** — await ACTIONS + ITINERARY in order  
**Scope:** PlanVersion WriteTarget only  

## Admission (frozen)

- Verified (`AUTHORIZED`) + `verified_plan_version_only`
- Candidate `original`, empty plan operations
- **No** materialize / Trip / ItineraryItem / mixedTargets / payment / external SE
- WriteTarget: **PlanVersion** only

All other execute paths: **Legacy + Shadow**.

## Controls

| Control | Env / gate |
|---------|------------|
| Authorize | `UWC_UNIFIED_CANARY_AUTHORIZED=1` |
| Kill switch | `UWC_UNIFIED_CANARY_KILL_SWITCH=1` |
| Percent | `UWC_UNIFIED_CANARY_PERCENT` — **first round recommend `0`** |
| Trip allowlist | `UWC_UNIFIED_CANARY_TRIP_ALLOWLIST` — **required explicit test trips** |
| Op allowlist | `verified_plan_version_only` |
| Cutover | `APPROVED_FOR_CANARY` then `beginUnifiedExecuteCanary()` |

Global AUTHORITATIVE and compensation exec remain **LOCKED**.

## Cutover (ordered)

```ts
approveUnifiedExecuteForCanary();
// set env (percent 0 + trip allowlist)
beginUnifiedExecuteCanary();
// …ops pass…
advanceCutoverAfterUnifiedCanaryPass();
```

→ UNIFIED **CANARY_APPROVED** only — **no** auto change to `UWC_1C_OCC_UNLOCKED` / compensation.

See `CANARY_OPS_RUNBOOK.md`. Next decision after all three: **`UWC-CUTOVER-01`**.
