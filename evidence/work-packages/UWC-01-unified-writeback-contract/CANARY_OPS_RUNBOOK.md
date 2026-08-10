# UWC Canary Ops Runbook — Ordered Execution Only

**Code freeze:** CANARY-01/02/03 are frozen. This document is the **only** engineering next step.

Ops term **CANARY_PASSED** ≡ code status `CANARY_APPROVED`.  
Ops term **BLOCKED** ≡ `BLOCKED_UNTIL_PRIOR_CORRIDOR`.

Helpers live in:
`src/decision-runtime/execution/authoritative-write/corridor-cutover.gate.ts`

---

## 1. Finish ACTIONS Canary

Run ACTIONS canary with existing frozen admission (`execution.remind` / no-effect).

**On pass:**

```ts
advanceCutoverAfterActionsCanaryPass();
```

**Expected:**

| Corridor | Result |
|----------|--------|
| ACTIONS_COMMIT | **CANARY_PASSED** (`CANARY_APPROVED`) |
| ITINERARY_ADJUST | **PENDING_CANARY_REVIEW** |
| UNIFIED_EXECUTE | **BLOCKED** |

---

## 2. Open ITINERARY Canary

After independent review of frozen scope only:

- `same_day_time_adjust`
- unbooked / unlocked / no external SE
- WriteTargets: Trip + ItineraryItem

```ts
beginItineraryAdjustCanary();
```

Set ITINERARY env (trip allowlist + percent as ops choose). Run canary.

**On pass:**

```ts
advanceCutoverAfterItineraryCanaryPass();
```

**Expected:**

| Corridor | Result |
|----------|--------|
| ITINERARY_ADJUST | **CANARY_PASSED** (`CANARY_APPROVED`) |
| UNIFIED_EXECUTE | **PENDING_CANARY_REVIEW** |

---

## 3. Independently approve UNIFIED Canary (traffic still gated until begin)

```ts
approveUnifiedExecuteForCanary();
// → UNIFIED_EXECUTE = APPROVED_FOR_CANARY
```

Env (first round — **percent 0**, explicit trip allowlist):

```bash
UWC_UNIFIED_CANARY_AUTHORIZED=1
UWC_UNIFIED_CANARY_KILL_SWITCH=0
UWC_UNIFIED_CANARY_PERCENT=0
UWC_UNIFIED_CANARY_TRIP_ALLOWLIST=<explicit test trip ids>
UWC_UNIFIED_CANARY_OP_ALLOWLIST=verified_plan_version_only
```

Then:

```ts
beginUnifiedExecuteCanary();
# → CANARY_IN_PROGRESS — real traffic eligibility
```

**Admitted traffic only when selected:**

- AUTHORIZED + `verified_plan_version_only` + `original` + empty operations + PlanVersion-only  

**All other requests:** Legacy + Shadow.

---

## 4. UNIFIED Canary pass

```ts
advanceCutoverAfterUnifiedCanaryPass();
```

**Expected:**

| Corridor | Result |
|----------|--------|
| UNIFIED_EXECUTE | **CANARY_APPROVED** only |

**Must remain false:**

- `UWC_1C_OCC_UNLOCKED=false`
- `UWC_1D_COMPENSATION_EXEC_AUTHORIZED=false`

---

## After all three pass

Do **not** unlock global AUTHORITATIVE.

Open **`UWC-CUTOVER-01`** as a separate decision: whether to promote a corridor from `AUTHORITATIVE_CANARY` → `AUTHORITATIVE`, still in order:

1. ACTIONS_COMMIT  
2. ITINERARY_ADJUST  
3. UNIFIED_EXECUTE PlanVersion-only  

Then (only after cutover decisions): **UWC-1e** client protocol.
