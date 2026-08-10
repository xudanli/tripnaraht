# M2 Contract — MOVE+ADD (same-day atomic composite)

**Status:** **IMPLEMENTED** — evidence [`P0-1-ARRANGE-MOVE-ADD-UWC-SLICE.md`](../P0-1-ARRANGE-MOVE-ADD-UWC-SLICE.md)  
**Date:** 2026-07-25  
**Parent:** [`M2-ARRANGE-CORRIDOR-BREADTH.md`](../M2-ARRANGE-CORRIDOR-BREADTH.md) · ADR-011

---

## Preview I/O

| Direction | Shape |
|-----------|-------|
| Arrange hint | `uwcPreview.open=true`, `slice: itinerary_same_day_move_and_add`, `expectedTripRevision`, `timeUpdates[]`, `itemCreates[]` |
| Open when | `changes[]` only `MOVE` and `ADD`; **≥1 of each**; **single** `dayIndex`; MOVE has `itemId`+times; ADD has numeric `placeId`+times |
| Closed when | Multi-day · REMOVE/REORDER/REMOVE_CANDIDATE · ADD without placeId · pure MOVE or pure ADD (use simple slices) |
| UWC Preview | `previewSameDayMoveAndAdd` → draft with `operation: same_day_move_and_add`, both arrays |

## Authoritative Action Type

| Field | Value |
|-------|-------|
| UWC slice | `itinerary_same_day_move_and_add` |
| Canary op | `same_day_move_and_add` |
| Corridor | `ITINERARY_ADJUST` |

## Affected entities

| Entity | Mutation |
|--------|----------|
| `ItineraryItem` (MOVE) | update `startTime` / `endTime` |
| `ItineraryItem` (ADD) | create rows |
| `Trip.metadata.revision` | +1 **once** |
| `Trip.metadata.uwcItineraryCanaryIdem` | durable idem key |
| PlanVersion | **revision-only** |
| Candidates | none (use from-candidates for pool delete) |

## OCC

`expectedWriteVersion.kind = RESOURCE_VERSION_SET` on `tripId` (= `expectedTripRevision`).

## VERIFY pre / post

| Phase | Requirement |
|-------|-------------|
| Pre | MOVE targets exist on trip; not paid/booked/locked; both arrays non-empty; op/trip allowlisted; same-day windows |
| Post | MOVE times applied; ADDs created; **one** revision bump; idem `APPLIED` |

Booked/paid/locked → **REJECT**.

## Confirm Token

Sealed UWC-1e confirmation; immutable `previewHash` / `expectedVersion` / `verificationProof` / `confirmationToken`.

## Atomic transaction boundary

Single DB txn: `SELECT Trip FOR UPDATE` → OCC → apply all MOVE updates → create all ADDs → bump revision + idem → commit.  
Abort ⇒ zero durable writes (no half MOVE / half ADD).

## Compensation

Txn abort only. No client auto-undo. Must **not** compensate by calling pure time-adjust then pure ADD.

## PlanVersion Diff

**Revision-only**. Audit carries both families under `SAME_DAY_MOVE_AND_ADD`.

## Idempotency

Same `idempotencyKey` → ≤1 composite batch; replay → `IDEMPOTENT_REPLAY`.

## Audit / Trace

reasonCodes include `SAME_DAY_MOVE_AND_ADD`; writeTargets `Trip` + `ItineraryItem`.

## Hard exclusions

- Emulating via sequenced `same_day_time_adjust` + `same_day_add_item` Confirms  
- Multi-day MOVE+ADD  
- Mixing REMOVE / REORDER / candidateRemovals in this op  
- Cross-day REDUCE_INTENSITY (separate M2 step)  

## Protocol rule

**One** Preview → **one** Confirm → **one** atomic Apply → **one** revision bump.  
ADR-011 dual-path ban: clients must not fan-out two simple slices for one user action.
