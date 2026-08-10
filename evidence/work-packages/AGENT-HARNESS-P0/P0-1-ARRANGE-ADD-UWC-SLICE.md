# P0-1 — Arrange ADD UWC Slice

**Date:** 2026-07-25  
**Status:** **PASS**  
**Scope:** Open Arrange same-day ADD onto UWC-1e Preview→Confirm→Apply (`ITINERARY_ADJUST`)

---

## Claim

> Same-day Arrange ADD (placeId + start/end on one trip day, no MOVE mix) opens `uwcPreview` with slice `itinerary_same_day_add_item`, and Apply creates ≤1 ItineraryItem per idempotency key (replay → `IDEMPOTENT_REPLAY`).

---

## Slice

| Field | Value |
|-------|-------|
| Slice | `itinerary_same_day_add_item` |
| Corridor | `ITINERARY_ADJUST` (D2 canary) |
| Op | `same_day_add_item` |
| Mutation | `itemCreates[]` (no `timeUpdates`) |
| Excluded | Mixed MOVE+ADD · multi-day · auto-arrange · booked/paid |

---

## Landed surfaces

| Layer | Change |
|-------|--------|
| Admit / config | `same_day_add_item` in default op allowlist |
| Executor | Creates Items + OCC revision + durable canary idem |
| Handler | Accepts `itemCreates` XOR `timeUpdates` |
| UWC-1e | First-batch slice + OpenAPI enum + `previewSameDayAddItem` |
| Arrange bridge | `plan-proposal-uwc-preview.util` opens ADD when placeId+times |
| Apply prisma | `ClientWriteProtocolService` injects `PrismaService` for ITINERARY/UNIFIED |
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
| util ADD open | placeId+times → `itinerary_same_day_add_item` | **PASS** |
| MX-ARRANGE-HINT→ADD | preview → Apply×2 create once | **PASS** |
| admit ADD / reject mixed | SAME_DAY_ADD_ITEM / MIXED_* | **PASS** |
| client contract | `previewSameDayAddItem` web+ios | **PASS** |

---

## Still OPEN (product NO-GO)

- Multi-day / MOVE+ADD — **M2** (`M2-ARRANGE-CORRIDOR-BREADTH.md`)  
- Same-day REORDER **CLOSED** — `P0-1-ARRANGE-REORDER-UWC-SLICE.md`  
- Same-day REMOVE **CLOSED** — `P0-1-ARRANGE-REMOVE-UWC-SLICE.md`  
- Single-day AUTO_ARRANGE **CLOSED** — `P0-1-AUTO-ARRANGE-UWC-SLICE.md`  
- Staging canary — **M1**  
- Corridor authoritative expansion still locked  

See [`P0-1-STATUS.md`](./P0-1-STATUS.md).
