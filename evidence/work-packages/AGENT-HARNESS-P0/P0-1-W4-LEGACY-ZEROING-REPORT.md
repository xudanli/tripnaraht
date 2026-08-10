# P0-1 W4 — Legacy Direct-Write Zeroing Report

**Date:** 2026-07-24  
**Scope:** Named HIGH inventory (B1–B9, C1–C2, C7, C9–C10, C16–C18, D1)  
**Write chain default:** `EFFECTIVE_PLAN_WRITE_CHAIN` unset → **ON**  
**Verdict:** **PASS** — open named HIGH entries = **0**  
**Round status:** [`P0-1-STATUS.md`](./P0-1-STATUS.md) — UWC foundation **FEATURE_COMPLETE**; same-day Arrange **RELEASE CANDIDATE**; product **PRODUCTION NO-GO**

Interactive summary:  
`~/.cursor/projects/home-devbox-project/canvases/agent-harness-p0-1-w4-legacy-zeroing-report.canvas.tsx`

Inventory companion:  
`~/.cursor/projects/home-devbox-project/canvases/agent-harness-p0-1-write-chain-closure.canvas.tsx`

---

## Exit criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| HIGH Legacy open entries = 0 | **PASS** | 12 named families CLOSED (see matrix) |
| Write chain forced | **PASS** | CHAIN unset→ON; GUARD default ENFORCE; boot assert |
| CI forbid new writes | **PASS** | `npm run ci:forbid-legacy-itinerary-writes` → OK, allowlist=37, new_offenders=0 |
| Confirm idempotency proof (full product) | **MATRIX 10/10 + embedded MULTI-INSTANCE PASS / product PARTIAL** | Staging multi-host = **M1 OPEN** |
| Production Ready | **NO-GO** | M1 canary + M2 breadth incomplete; see `P0-1-STATUS.md` |

---

## Named HIGH close matrix

| ID | Entry | Gate | Status |
|----|-------|------|--------|
| B1–B6 | INTAKE tryApply* / draft-apply | `trip.applyEdit` skill `isDirectPlanMutationBlocked` | CLOSED |
| B7 | maybeAutoApply* | early `ADVICE_ONLY` | CLOSED |
| B8–B9 | trip.applyEdit / deleteItem | skill block | CLOSED |
| C1 | proposals apply | `assertDirect('plan-proposal.apply')` | CLOSED |
| C2 | arrange direct / autoArrange | `mutateWithMode.direct` + autoArrange assert | CLOSED |
| C7 | mobile.patchActivity | `assertDirect('mobile.patchActivity')` | CLOSED |
| C9 | ERC/advisory apply | PREVIEW only + CHAIN_REQUIRED | CLOSED |
| C10 | ERC confirm | AE path; assertDirect removed from confirm-write | CLOSED |
| C16 | applyOptimization | non-dryRun assert | CLOSED |
| C17 | saveSchedule / converter | dual assert | CLOSED |
| C18 | budget autoCommit | autoCommit assert | CLOSED |
| D1 | itinerary-items CRUD + batchUpdate | service + controller assert | CLOSED |

**Open HIGH count: 0**

---

## MED / EPWG — P1 tracking

| Surface | Gate today | Next |
|---------|------------|------|
| B10–B16 trip.actions / System1 / PA / planner | EPWG `assertPlanMutationAllowedOrThrow` | Migrate to AE/UWC |
| C11–C14 readiness / feasibility applyRepair | EPWG | decision-problems apply |
| Repair utils (plan-object / travel-timing / buffer) | via feasibility EPWG | keep under AE |
| D2 item-cost | allowed non-authority field | audit tag |

---

## Residuals (P1 update 2026-07-24)

**Gated (mutate-existing, chain ON):**

- `exploration.seedForSelectedRoute`
- `guide-trip.materializeItineraryIntoTrip`
- `split-plan.persistApplyManifest`

**Bootstrap create — EPWG-authorized seed (not assertDirect):**

- `trip-draft.createItineraryItemsFromDraft` → `runBootstrapPlanSeedWithAuthority`
- `route-directions.createTripFromTemplate` → same
- `trip-extended.importTripFromShare` → same

Evidence: `P0-1-BOOTSTRAP-AE-SEED.md`

---

## Authoritative channels (kept)

- **UWC PCA** — 3 canary slices; Apply `IDEMPOTENT_REPLAY`  
- **DecisionCore AE** — `runWithAuthority('execute')` / Rfc001 materializer  

---

## Verification (2026-07-24)

```bash
npm run ci:forbid-legacy-itinerary-writes
# OK — allowlist=37, new_offenders=0

npx jest \
  src/agent/services/agent-itinerary-write-chain.spec.ts \
  src/trips/page-apply-write-chain.w2.spec.ts \
  src/trips/mobile-advisory-write-chain.w3.spec.ts \
  src/trips/trip-constraint-solver/utils/execution-advisory-write-chain.util.spec.ts \
  --runInBand
# 4 suites / 20 tests PASS
```

---

## Conclusion

- **P0-1 named HIGH zeroing: PASS**  
- **Production Ready: still NO-GO**  
- **Next:** **M1** Staging multi-instance canary → then **M2** Arrange breadth (`P0-1-STATUS.md`)
