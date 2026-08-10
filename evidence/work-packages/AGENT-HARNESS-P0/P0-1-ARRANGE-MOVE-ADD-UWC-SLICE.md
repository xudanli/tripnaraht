# P0-1 / M2 — Arrange MOVE+ADD UWC Slice (atomic composite)

**Date:** 2026-07-25  
**Status:** **PASS**  
**Contract:** [`m2-contracts/MOVE_AND_ADD.md`](./m2-contracts/MOVE_AND_ADD.md)  
**Scope:** Open Arrange same-day MOVE+ADD onto **one** UWC-1e Preview→Confirm→Apply (no corridor chaining)

---

## Claim

> Same-day Arrange proposals with ≥1 `MOVE` and ≥1 `ADD` (single `dayIndex`, placeId+times on ADD) open `uwcPreview` with slice `itinerary_same_day_move_and_add`. Apply runs MOVE time updates + ADD creates in **one** DB txn / **one** revision bump. Emulating via `same_day_time_adjust` + `same_day_add_item` under pure ops is **rejected**.

---

## Slice

| Field | Value |
|-------|-------|
| Slice | `itinerary_same_day_move_and_add` |
| Corridor | `ITINERARY_ADJUST` |
| Op | `same_day_move_and_add` |
| Mutation | `timeUpdates[]` **and** `itemCreates[]` (composite family) |
| Excluded | Multi-day · REMOVE/REORDER/candidates · pure MOVE or pure ADD · sequenced simple slices |

---

## Landed surfaces

| Layer | Change |
|-------|--------|
| Admit / config | `same_day_move_and_add`; reason `ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN` |
| Executor | Allows time+create as sole multi-kind family; one txn |
| Handler | Family reason `SAME_DAY_MOVE_AND_ADD` when both present |
| UWC-1e | First-batch + OpenAPI + `previewSameDayMoveAndAdd` |
| Arrange bridge | `trySameDayMoveAndAdd` before pure openers |
| Clients | Web/iOS + arrange DTO union |

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
| util MOVE+ADD open | MOVE+ADD same day → composite slice | **PASS** |
| MX-ARRANGE-HINT→MOVE_ADD | preview → Apply×2 once each of update+create | **PASS** |
| admit composite / reject chain | SAME_DAY_MOVE_AND_ADD / MIXED_* under pure ops | **PASS** |
| client contract | `previewSameDayMoveAndAdd` web+ios | **PASS** |

---

## Still OPEN (M2 next)

- REDUCE_INTENSITY (often REST ADD ± cross-day MOVE)  
- Multi-day AUTO_ARRANGE  
- Full product remains **PRODUCTION NO-GO**

See [`M2-ARRANGE-CORRIDOR-BREADTH.md`](./M2-ARRANGE-CORRIDOR-BREADTH.md) · [`P0-1-STATUS.md`](./P0-1-STATUS.md).
