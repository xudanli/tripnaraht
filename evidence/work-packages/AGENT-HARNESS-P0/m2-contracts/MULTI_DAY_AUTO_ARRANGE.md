# M2 Contract — Multi-day AUTO_ARRANGE (atomic)

**Status:** **IMPLEMENTED** — evidence [`P0-1-ARRANGE-MULTI-DAY-AUTO-ARRANGE-UWC-SLICE.md`](../P0-1-ARRANGE-MULTI-DAY-AUTO-ARRANGE-UWC-SLICE.md)  
**Date:** 2026-07-25  
**Parent:** [`M2-ARRANGE-CORRIDOR-BREADTH.md`](../M2-ARRANGE-CORRIDOR-BREADTH.md) · ADR-011

---

## Preview I/O

| Direction | Shape |
|-----------|-------|
| Arrange hint | `uwcPreview.open=true`, `slice: itinerary_multi_day_add_from_candidates`, `expectedTripRevision`, `itemCreates[]`, `candidateRemovals[]` |
| Open when | `changes[]` only `ADD` + `REMOVE_CANDIDATE`; ADD has placeId+times; **≥2 distinct `dayIndex`**; candidate ids present |
| Closed when | Single dayIndex (→ `same_day_add_from_candidates`) · MOVE/REMOVE/REORDER · ADD without placeId · missing candidate removals |
| UWC Preview | `previewMultiDayAddFromCandidates` → `operation: multi_day_add_from_candidates` |

## Authoritative Action Type

| Field | Value |
|-------|-------|
| UWC slice | `itinerary_multi_day_add_from_candidates` |
| Canary op | `multi_day_add_from_candidates` |
| Corridor | `ITINERARY_ADJUST` |

## Affected entities

| Entity | Mutation |
|--------|----------|
| `ItineraryItem` | create across multiple `tripDayId`s |
| `TripAttractionExploreCandidate` | `deleteMany` for listed ids |
| `Trip.metadata.revision` | +1 **once** |
| PlanVersion | **revision-only** |

## OCC

`RESOURCE_VERSION_SET` on `tripId` (= `expectedTripRevision`).

## VERIFY pre / post

| Phase | Requirement |
|-------|-------------|
| Pre | Creates valid windows; candidates scoped to trip; op/trip allowlisted; ≥2 trip days represented in creates |
| Post | All creates + candidate deletes committed together; one revision; idem `APPLIED` |

Fail mid-txn ⇒ **zero** days written.

## Confirm Token

Sealed UWC-1e confirmation; immutable tokens.

## Atomic transaction boundary

Single DB txn: lock Trip → OCC → all creates → all candidate deletes → revision + idem.  
**Must not** Apply per day / chain N× `same_day_add_from_candidates`.

## Compensation

Txn abort only. No client auto-undo.

## PlanVersion Diff

**Revision-only**. reasonCodes: `MULTI_DAY_ADD_FROM_CANDIDATES`, `ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN`, `CANDIDATE_POOL_DELETE`.

## Idempotency

Same key → ≤1 multi-day batch; replay → `IDEMPOTENT_REPLAY`.

## Hard exclusions

- Emulating via sequenced same-day from-candidates Confirms  
- Mixing MOVE / REMOVE / REORDER / timeUpdates  
- Single-day proposals (use same-day slice)  
- Booked/paid/locked item flags when provided → REJECT  

## Protocol rule

One Preview → one Confirm → one atomic Apply → one revision bump for the **whole** multi-day proposal.
