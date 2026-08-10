# M2 Contract — REORDER (same-day)

**Status:** **IMPLEMENTED** — evidence [`P0-1-ARRANGE-REORDER-UWC-SLICE.md`](../P0-1-ARRANGE-REORDER-UWC-SLICE.md)  
**Date:** 2026-07-25  
**Parent:** [`M2-ARRANGE-CORRIDOR-BREADTH.md`](../M2-ARRANGE-CORRIDOR-BREADTH.md) · ADR-011

---

## Preview I/O

| Direction | Shape |
|-----------|-------|
| Arrange hint | `uwcPreview.open=true`, `slice: itinerary_same_day_reorder_items`, `expectedTripRevision`, `itemReorders: { itemId, order }[]` |
| Open when | `changes[]` all `operation=REORDER` with non-empty `itemId`; **single** `dayIndex`; `order` from change or dense `1..n` by change list order |
| Closed when | Multi-day · mixed MOVE/ADD/REMOVE · missing `itemId` · time fields present on REORDER (time rewrite → use time-adjust) |
| UWC Preview | `previewSameDayReorderItems` → draft with `operation: same_day_reorder_items`, `itemReorders` |

## Authoritative Action Type

| Field | Value |
|-------|-------|
| UWC slice | `itinerary_same_day_reorder_items` |
| Canary op | `same_day_reorder_items` |
| Corridor | `ITINERARY_ADJUST` |

## Affected entities

| Entity | Mutation |
|--------|----------|
| `ItineraryItem.order` | update per `{ itemId, order }` |
| `ItineraryItem.startTime` / `endTime` | **unchanged** (no time rewrite in this slice) |
| `Trip.metadata.revision` | +1 on Apply |
| `Trip.metadata.uwcItineraryCanaryIdem` | durable idem key |
| PlanVersion | **revision-only** |
| Candidates | none |

## OCC

`expectedWriteVersion.kind = RESOURCE_VERSION_SET` on `tripId` (= `expectedTripRevision`).

## VERIFY pre / post

| Phase | Requirement |
|-------|-------------|
| Pre | Items exist on trip (same trip via `TripDay`); not paid/booked/locked; op allowlisted; trip allowlisted; `order` finite non-negative int |
| Post | Each listed item has target `order`; times unchanged; revision bumped once; idem map `APPLIED` |

Booked/paid/locked → **REJECT** (no DecisionCore escalate in this slice).

## Confirm Token

Sealed UWC-1e confirmation (`confirmationId`); immutable `previewHash` / `expectedVersion` / `verificationProof` / `confirmationToken`.

## Atomic transaction boundary

Single DB txn: `SELECT Trip FOR UPDATE` → OCC → update `order` fields → bump revision + idem → commit.

## Compensation

Txn abort on failure (no partial reorder). No client auto-undo.

## PlanVersion Diff

**Revision-only**. Diff = `{ itemId, order }` pairs in audit `corridorResult` / reasonCodes.

## Idempotency

Same `idempotencyKey` → ≤1 durable reorder batch; replay → `IDEMPOTENT_REPLAY`.

## Audit / Trace

`requestId`, `traceId`, reasonCodes include `SAME_DAY_REORDER_ITEMS`, writeTargets `Trip` + `ItineraryItem`.

## Hard exclusions

- Multi-day REORDER batch  
- REORDER + MOVE/ADD/REMOVE/time in one Confirm  
- REORDER that also rewrites start/end (use `same_day_time_adjust`)  
- Booked / paid / locked items  

## Protocol rule

One Preview → one Confirm → one atomic Apply → one revision bump.  
Must **not** emulate reorder via sequenced time-adjust Applies.
