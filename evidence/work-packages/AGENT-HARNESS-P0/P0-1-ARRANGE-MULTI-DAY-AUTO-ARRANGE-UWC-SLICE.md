# P0-1 / M2 — Multi-day AUTO_ARRANGE UWC Slice

**Date:** 2026-07-25  
**Status:** **PASS**  
**Contract:** [`m2-contracts/MULTI_DAY_AUTO_ARRANGE.md`](./m2-contracts/MULTI_DAY_AUTO_ARRANGE.md)  
**Scope:** Multi-day ADD+REMOVE_CANDIDATE as **one** UWC Apply (all-or-nothing)

---

## Claim

> Arrange AUTO_ARRANGE / FILL_GAP proposals with ADD(+placeId+times)+REMOVE_CANDIDATE across **≥2** `dayIndex` values open `uwcPreview` with slice `itinerary_multi_day_add_from_candidates`. Apply creates all Items + deletes all candidates in **one** DB txn / **one** revision. Emulating via N× `same_day_add_from_candidates` is forbidden.

---

## Slice

| Field | Value |
|-------|-------|
| Slice | `itinerary_multi_day_add_from_candidates` |
| Op | `multi_day_add_from_candidates` |
| Mutation | `itemCreates[]` (multi `tripDayId`) + `candidateRemovals[]` |
| XOR | Single dayIndex → `same_day_add_from_candidates` |

---

## Landed surfaces

| Layer | Change |
|-------|--------|
| Admit / config | `multi_day_add_from_candidates`; ≥2 tripDayIds required |
| Executor | Same create+delete loops; audit `MULTI_DAY_ADD_FROM_CANDIDATES` |
| Preview | `tryMultiDayAddFromCandidates` before same-day opener |
| UWC-1e | First-batch + `previewMultiDayAddFromCandidates` |

---

## Verification

```bash
npx jest src/trips/arrange-itinerary/utils/plan-proposal-uwc-preview.util.spec.ts \
  src/trips/confirm-apply-idempotency.matrix.spec.ts \
  src/agent/contracts/uwc-1e-client-contract.matrix.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-canary-02.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-1e-client-protocol.contract.spec.ts \
  src/decision-runtime/execution/authoritative-write/uwc-1e-fullstack.e2e.spec.ts \
  --runInBand
```

| ID | Assert | Result |
|----|--------|--------|
| util multi-day open | ≥2 days → multi-day slice | **PASS** |
| MX-ARRANGE-HINT→MULTI_DAY_AUTO_ARRANGE | Apply×2 create+delete once | **PASS** |
| admit multi-day / reject 1 day | MULTI_DAY_* | **PASS** |

---

## M2 exit

With this slice, M2 steps 1–5 are **complete**. Full product remains **PRODUCTION NO-GO** pending separate GO (Iceland/Mobile, corridor AUTHORITATIVE expansion, etc.).

See [`M2-ARRANGE-CORRIDOR-BREADTH.md`](./M2-ARRANGE-CORRIDOR-BREADTH.md) · [`P0-1-STATUS.md`](./P0-1-STATUS.md).
