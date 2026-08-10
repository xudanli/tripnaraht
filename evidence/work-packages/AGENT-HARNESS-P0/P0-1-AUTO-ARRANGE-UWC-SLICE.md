# P0-1 — Auto-Arrange UWC Slice

**Date:** 2026-07-25  
**Status:** **PASS**  
**Scope:** Open single-day AUTO_ARRANGE (ADD + REMOVE_CANDIDATE) onto UWC-1e Preview→Confirm→Apply (`ITINERARY_ADJUST`)

---

## Claim

> Same-day Arrange AUTO_ARRANGE (ADD with placeId+times paired with REMOVE_CANDIDATE on one trip day) opens `uwcPreview` with slice `itinerary_same_day_add_from_candidates`, and Apply creates ≤1 Item batch + candidate deletes per idempotency key (replay → `IDEMPOTENT_REPLAY`).

---

## Slice

| Field | Value |
|-------|-------|
| Slice | `itinerary_same_day_add_from_candidates` |
| Corridor | `ITINERARY_ADJUST` (D2 canary) |
| Op | `same_day_add_from_candidates` |
| Mutation | `itemCreates[]` + `candidateRemovals[]` (no `timeUpdates`) |
| Excluded | Multi-day · MOVE+ADD · REMOVE/REORDER · booked/paid |

---

## Why not reuse `itinerary_same_day_add_item`?

AUTO_ARRANGE always pairs ADD with `REMOVE_CANDIDATE`. Candidate-pool deletes are a third mutation (legacy `tripAttractionExploreCandidate.deleteMany`) and are explicitly out of the pure-ADD slice.

---

## Landed surfaces

| Layer | Change |
|-------|--------|
| Admit / config | `same_day_add_from_candidates` in default op allowlist |
| Executor | Creates Items + deletes candidates + OCC + durable idem |
| Handler | Passes `candidateRemovals` |
| UWC-1e | First-batch slice + OpenAPI + `previewSameDayAddFromCandidates` |
| Arrange bridge | Preview opens when ADD+REMOVE_CANDIDATE, single day |
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
| util from-candidates open | ADD+REMOVE_CANDIDATE → slice | **PASS** |
| MX-ARRANGE-HINT→AUTO_ARRANGE | preview → Apply×2 create+delete once | **PASS** |
| admit from-candidates | requires candidateRemovals | **PASS** |
| client contract | `previewSameDayAddFromCandidates` web+ios | **PASS** |

---

## Still OPEN (product NO-GO)

- Multi-day auto-arrange **CLOSED** — `P0-1-ARRANGE-MULTI-DAY-AUTO-ARRANGE-UWC-SLICE.md`  
- Staging LB multi-instance canary — **M1**  
- Corridor authoritative expansion still locked  

See [`P0-1-STATUS.md`](./P0-1-STATUS.md).
