# P0-1 / M2 — Arrange REORDER UWC Slice

**Date:** 2026-07-25  
**Status:** **PASS**  
**Contract:** [`m2-contracts/REORDER.md`](./m2-contracts/REORDER.md)  
**Scope:** Open Arrange same-day REORDER onto UWC-1e Preview→Confirm→Apply (`ITINERARY_ADJUST`)

---

## Claim

> Same-day Arrange REORDER (all `operation=REORDER` with `itemId`, single `dayIndex`, no time fields, unbooked/unlocked) opens `uwcPreview` with slice `itinerary_same_day_reorder_items`, and Apply updates `ItineraryItem.order` ≤1 batch per idempotency key (replay → `IDEMPOTENT_REPLAY`). Times are not rewritten.

---

## Slice

| Field | Value |
|-------|-------|
| Slice | `itinerary_same_day_reorder_items` |
| Corridor | `ITINERARY_ADJUST` (D2 canary) |
| Op | `same_day_reorder_items` |
| Mutation | `itemReorders: { itemId, order }[]` (XOR vs time/create/remove/candidate) |
| Excluded | Multi-day · MOVE/ADD/REMOVE mix · time rewrite on REORDER · booked/paid/locked |

---

## Landed surfaces

| Layer | Change |
|-------|--------|
| Admit / config | `same_day_reorder_items` in default op allowlist |
| Executor | `findFirst` + booked checks + `order` update; OCC; durable canary idem |
| Handler | Passes `itemReorders` |
| UWC-1e | First-batch slice + OpenAPI enum + `previewSameDayReorderItems` |
| Arrange bridge | `plan-proposal-uwc-preview.util` opens REORDER; dense `1..n` if `order` omitted |
| Clients | Web/iOS helpers + arrange DTO union |

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
| util REORDER open | REORDER×n same day → `itinerary_same_day_reorder_items` | **PASS** |
| MX-ARRANGE-HINT→REORDER | preview → Apply×2 order once | **PASS** |
| admit REORDER / reject mixed | SAME_DAY_REORDER_ITEMS / MIXED_* | **PASS** |
| client contract | `previewSameDayReorderItems` web+ios | **PASS** |

---

## Still OPEN (M2 next)

- Multi-day AUTO_ARRANGE  
- Full product remains **PRODUCTION NO-GO**

See [`M2-ARRANGE-CORRIDOR-BREADTH.md`](./M2-ARRANGE-CORRIDOR-BREADTH.md) · [`P0-1-STATUS.md`](./P0-1-STATUS.md).
