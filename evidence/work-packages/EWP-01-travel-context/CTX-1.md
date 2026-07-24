# CTX-1 — Corridor-local freshness field inventory

**Status:** DONE  
**Parent gate:** Context track OPEN_SCOPED_TASK (inventory only)  
**Claims:** C021b (additive)

## Deliverable

`src/agent/contracts/corridor-local-freshness.inventory.ts` — maps each product corridor to its **local** freshness fields and conflict signals.

| Corridor | Fields | Stale / conflict |
|----------|--------|------------------|
| route_and_run | snapshotId / expected_negotiation_hash / … | **No** global `contextHash` |
| TravelContext | revision / snapshotId / basedOnRevision | REVISION_CONFLICT |
| Page Insight | contextHash (`ctxh_*`) | page-local |
| Arrange | contextVersion | phase CONTEXT_STALE + HTTP CONTEXT_VERSION_CONFLICT |
| Mobile | If-Match contextVersion | CONTEXT_VERSION_CONFLICT |
| TEP Repair | basePlanVersionId | STALE_REPAIR_OPTION |
| Unified | decision revision / idempotency | corridor-specific |
| Decision Space handoff | contextHash (samples) | handoff only |

## Forbidden (honored)

`GLOBAL_TRAVEL_CONTEXT_SSOT_WIRE_FORBIDDEN` — do **not** wire TravelContext as global runtime SSOT from this inventory.

## Tests

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/corridor-local-freshness.inventory.spec.ts \
  src/agent/contracts/travel-context-projection.contract.spec.ts
```
