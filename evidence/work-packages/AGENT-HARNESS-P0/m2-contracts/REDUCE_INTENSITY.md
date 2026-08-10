# M2 Contract — REDUCE_INTENSITY (same-day atomic composite)

**Status:** **IMPLEMENTED** — evidence [`P0-1-ARRANGE-REDUCE-INTENSITY-UWC-SLICE.md`](../P0-1-ARRANGE-REDUCE-INTENSITY-UWC-SLICE.md)  
**Date:** 2026-07-25  
**Parent:** [`M2-ARRANGE-CORRIDOR-BREADTH.md`](../M2-ARRANGE-CORRIDOR-BREADTH.md) · ADR-011

---

## Preview I/O

| Direction | Shape |
|-----------|-------|
| Arrange hint | `uwcPreview.open=true`, `slice: itinerary_same_day_reduce_intensity`, `expectedTripRevision`, `timeUpdates[]`, `itemCreates[]` |
| Open when | `changes[]` only same-day `MOVE` + `ADD` with `itemType=REST` (no `placeId`); **≥1 of each**; **single** `dayIndex`; times present |
| Closed when | Multi-day / cross-day MOVE · place-bound ADD · REMOVE/REORDER/candidates · REST-only or MOVE-only |
| UWC Preview | `previewSameDayReduceIntensity` → `operation: same_day_reduce_intensity`, both arrays |

## Authoritative Action Type

| Field | Value |
|-------|-------|
| UWC slice | `itinerary_same_day_reduce_intensity` |
| Canary op | `same_day_reduce_intensity` |
| Corridor | `ITINERARY_ADJUST` |

## Affected entities

| Entity | Mutation |
|--------|----------|
| `ItineraryItem` (MOVE) | update `startTime` / `endTime` (shorten/shift; **same trip day**) |
| `ItineraryItem` (ADD REST) | create `type=REST`, `placeId=null` |
| `Trip.metadata.revision` | +1 **once** |
| PlanVersion | **revision-only** |
| Candidates | none |

## OCC

`RESOURCE_VERSION_SET` on `tripId` (= `expectedTripRevision`).

## VERIFY pre / post

| Phase | Requirement |
|-------|-------------|
| Pre | MOVE targets on trip; unbooked/unlocked; both arrays non-empty; creates are REST-class; allowlisted |
| Post | Times updated; REST rows created; one revision; idem `APPLIED` |

Booked/paid/locked → **REJECT**.

## Confirm Token

Sealed UWC-1e confirmation; immutable tokens.

## Atomic transaction boundary

Single DB txn: lock Trip → OCC → MOVE updates → REST creates → revision + idem. Abort ⇒ zero writes.

## Compensation

Txn abort only. Must **not** chain `same_day_time_adjust` + ADD.

## PlanVersion Diff

**Revision-only**. reasonCodes include `SAME_DAY_REDUCE_INTENSITY` + `ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN`.

## Idempotency

Same key → ≤1 composite batch; replay → `IDEMPOTENT_REPLAY`.

## Hard exclusions

- Cross-day relocate (legacy builder `dayNum+1` — **out of this slice**; builder must emit same-day for UWC open)  
- Multi-day AUTO_ARRANGE  
- Mixing REMOVE / REORDER / candidates  
- Emulating via two simple Confirms  

## Protocol rule

One Preview → one Confirm → one atomic Apply → one revision bump. Distinct from `same_day_move_and_add` (place-bound ADD).
