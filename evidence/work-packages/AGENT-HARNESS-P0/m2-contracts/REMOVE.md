# M2 Contract — REMOVE (same-day)

**Status:** **IMPLEMENTED** — evidence [`P0-1-ARRANGE-REMOVE-UWC-SLICE.md`](../P0-1-ARRANGE-REMOVE-UWC-SLICE.md)  
**Date:** 2026-07-25  
**Parent:** [`M2-ARRANGE-CORRIDOR-BREADTH.md`](../M2-ARRANGE-CORRIDOR-BREADTH.md) · ADR-011

---

## Preview I/O

| Direction | Shape |
|-----------|-------|
| Arrange hint | `uwcPreview.open=true`, `slice: itinerary_same_day_remove_item`, `expectedTripRevision`, `itemRemovals: string[]` |
| Open when | `changes[]` all `operation=REMOVE` with non-empty `itemId`; **single** `dayIndex` |
| Closed when | Multi-day · mixed MOVE/ADD · missing `itemId` · booked/paid known at preview (optional soft) |
| UWC Preview | `previewSameDayRemoveItem` → draft with `operation: same_day_remove_item`, `itemRemovals` |

## Authoritative Action Type

| Field | Value |
|-------|-------|
| UWC slice | `itinerary_same_day_remove_item` |
| Canary op | `same_day_remove_item` |
| Corridor | `ITINERARY_ADJUST` |

## Affected entities

| Entity | Mutation |
|--------|----------|
| `ItineraryItem` | `delete` (hard) for listed ids |
| `Trip.metadata.revision` | +1 on Apply |
| `Trip.metadata.uwcItineraryCanaryIdem` | durable idem key |
| PlanVersion | **revision-only** (no PlanVersion row for ITINERARY canary) |
| Candidates | none |

## OCC

`expectedWriteVersion.kind = RESOURCE_VERSION_SET` on `tripId` (= `expectedTripRevision`).

## VERIFY pre / post

| Phase | Requirement |
|-------|-------------|
| Pre | Items exist on trip; not paid/booked/locked; op allowlisted; trip allowlisted |
| Post | Items absent; revision bumped once; idem map `APPLIED` |

Booked/paid/locked → **REJECT** (escalate to DecisionCore only if product later requires soft cancel — out of this slice).

## Confirm Token

Sealed UWC-1e confirmation (`confirmationId`); immutable `previewHash` / `expectedVersion` / `verificationProof` / `confirmationToken`.

## Atomic transaction boundary

Single DB txn: `SELECT Trip FOR UPDATE` → OCC → delete items → bump revision + idem → commit.

## Compensation

Txn abort on failure (no partial delete). Authorized compensation exec unlock does **not** auto-undo REMOVE; no client auto-undo.

## PlanVersion Diff

**Revision-only** for this canary. Diff = removed item ids in audit `corridorResult` / reasonCodes.

## Idempotency

Same `idempotencyKey` → ≤1 durable delete batch; replay → `IDEMPOTENT_REPLAY` (even if rows already gone).

## Audit / Trace

`requestId`, `traceId`, reasonCodes include `SAME_DAY_REMOVE_ITEM`, writeTargets `Trip` + `ItineraryItem`.

## Hard exclusions

- Multi-day REMOVE batch  
- REMOVE + MOVE/ADD in one Confirm  
- REMOVE_CANDIDATE-only (use from-candidates / separate path)  
- Booked / paid / locked items  

## Protocol rule

One Preview → one Confirm → one atomic Apply → one revision bump.  
Must **not** chain time-adjust + remove as two slices for one user action.
