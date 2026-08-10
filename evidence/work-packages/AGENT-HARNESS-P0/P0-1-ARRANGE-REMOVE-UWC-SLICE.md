# P0-1 / M2 — Arrange REMOVE UWC Slice

**Date:** 2026-07-25  
**Status:** **PASS**  
**Contract:** [`m2-contracts/REMOVE.md`](./m2-contracts/REMOVE.md)  
**Scope:** Open Arrange same-day REMOVE onto UWC-1e Preview→Confirm→Apply (`ITINERARY_ADJUST`)

---

## Claim

> Same-day Arrange REMOVE (all `operation=REMOVE` with `itemId`, single `dayIndex`, unbooked/unlocked) opens `uwcPreview` with slice `itinerary_same_day_remove_item`, and Apply deletes ≤1 batch per idempotency key (replay → `IDEMPOTENT_REPLAY`).

---

## Slice

| Field | Value |
|-------|-------|
| Slice | `itinerary_same_day_remove_item` |
| Corridor | `ITINERARY_ADJUST` (D2 canary) |
| Op | `same_day_remove_item` |
| Mutation | `itemRemovals: string[]` (XOR vs time/create/candidate) |
| Excluded | Multi-day · MOVE/ADD mix · booked/paid/locked · REMOVE_CANDIDATE-only |

---

## Landed surfaces

| Layer | Change |
|-------|--------|
| Admit / config | `same_day_remove_item` in default op allowlist |
| Executor | `findFirst` + booked checks + `delete`; OCC revision; durable canary idem |
| Handler | Passes `itemRemovals` |
| UWC-1e | First-batch slice + OpenAPI enum + `previewSameDayRemoveItem` |
| Arrange bridge | `plan-proposal-uwc-preview.util` opens REMOVE when same-day remove-only |
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
| util REMOVE open | REMOVE×n same day → `itinerary_same_day_remove_item` | **PASS** |
| MX-ARRANGE-HINT→REMOVE | preview → Apply×2 delete once | **PASS** |
| admit REMOVE / reject mixed | SAME_DAY_REMOVE_ITEM / MIXED_* | **PASS** |
| client contract | `previewSameDayRemoveItem` web+ios | **PASS** |

---

## Still OPEN (M2 next)

- MOVE+ADD atomic · REDUCE_INTENSITY · multi-day AUTO_ARRANGE  
- Booked/paid → still REJECT (no DecisionCore soft-cancel in this slice)  
- Full product remains **PRODUCTION NO-GO**

See [`M2-ARRANGE-CORRIDOR-BREADTH.md`](./M2-ARRANGE-CORRIDOR-BREADTH.md) · [`P0-1-STATUS.md`](./P0-1-STATUS.md).
