# Corridor concurrency isolation (facts)

**Status:** DOCUMENTED (with CTX-1 / CC-1)  
**Rule:** Corridors use **local** freshness guards. There is **no** cross-corridor lock or unified `contextHash`.

| Corridor | Guard | Shared with others? |
|----------|-------|---------------------|
| Arrange | `contextVersion` + dual-signal (CC-1) | No |
| TEP | `basePlanVersionId` → `STALE_REPAIR_OPTION` | No |
| Mobile | `If-Match` / `CONTEXT_VERSION_CONFLICT` | Same code family as Arrange HTTP code name; **independent** services |
| route_and_run Phase2 | `STALE_PLAN_VERSION` | Main-chain only |
| TravelContext | `basedOnRevision` / `REVISION_CONFLICT` | Target module; not main-chain SSOT |
| Unified Execute | Idempotency-Key / decision scope | Decision-scoped |

**Unevidenced:** single e2e that concurrently writes Arrange+TEP+Mobile+Actions+Unified on one `tripId` (C024b).

Inventory SSOT: `src/agent/contracts/corridor-local-freshness.inventory.ts` (CTX-1).
