# P0-1 / M2 — Arrange REDUCE_INTENSITY UWC Slice

**Date:** 2026-07-25  
**Status:** **PASS**  
**Contract:** [`m2-contracts/REDUCE_INTENSITY.md`](./m2-contracts/REDUCE_INTENSITY.md)  
**Scope:** Same-day REST ADD + same-day MOVE (shorten) as one UWC Apply — no corridor chaining; no cross-day relocate

---

## Claim

> Arrange `REDUCE_INTENSITY` proposals that emit same-day `MOVE` + `ADD(itemType=REST)` open `uwcPreview` with slice `itinerary_same_day_reduce_intensity`. Apply updates times and creates REST in **one** txn / **one** revision. Cross-day relocate is out of scope; builder emits same-day shorten for UWC open.

---

## Slice

| Field | Value |
|-------|-------|
| Slice | `itinerary_same_day_reduce_intensity` |
| Op | `same_day_reduce_intensity` |
| Mutation | `timeUpdates[]` + REST `itemCreates[]` (`placeId` null) |
| Excluded | Cross-day MOVE · place-bound ADD · REMOVE/REORDER · sequenced simple slices |

---

## Landed surfaces

| Layer | Change |
|-------|--------|
| Builder | `buildReduceIntensityChanges` — same-day shorten + REST (no `dayNum+1`) |
| Admit / config | `same_day_reduce_intensity`; REST-only creates |
| Executor | Second time+create composite family via `operation` |
| UWC-1e | First-batch + `previewSameDayReduceIntensity` |
| Arrange bridge | `trySameDayReduceIntensity` before MOVE+ADD |

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
| util REDUCE open | REST+MOVE same day → reduce slice | **PASS** |
| MX-ARRANGE-HINT→REDUCE_INTENSITY | Apply×2 once | **PASS** |
| admit REST / reject place | SAME_DAY_REDUCE_INTENSITY | **PASS** |

---

## Still OPEN (M2 next)

- ~~Multi-day AUTO_ARRANGE~~ **CLOSED** — `P0-1-ARRANGE-MULTI-DAY-AUTO-ARRANGE-UWC-SLICE.md`  
- Full product remains **PRODUCTION NO-GO**

See [`M2-ARRANGE-CORRIDOR-BREADTH.md`](./M2-ARRANGE-CORRIDOR-BREADTH.md).
