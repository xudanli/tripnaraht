# EWP-04 — Cross-corridor concurrent writeback

**Status:** EVIDENCE_COMPLETE (corridor-local + contract; **no** unified multi-corridor suite)  
**Matrix v2 Claims:** C024, C024b  

## 1. Facts

| Corridor | Stale / conflict signal | Concurrent coalesce | Spec anchors |
|----------|-------------------------|---------------------|--------------|
| TEP | `STALE_REPAIR_OPTION` | yes (same option) | `tep-local-repair-apply.service.spec.ts`, `is-cert-writeback.integration.spec.ts` |
| route_and_run Phase2 | `STALE_PLAN_VERSION` | lock + stale B | `agent.route-and-run.phase2-stale-concurrency.e2e.spec.ts` |
| Mobile spatial/planning | `CONTEXT_VERSION_CONFLICT` / ifMatch | idempotent replay | `mobile-spatial-route.service.spec.ts`, `mobile-planning.service.spec.ts` |
| Arrange | Phase `CONTEXT_STALE`; throw `CONTEXT_VERSION_CONFLICT` on contextVersion mismatch | contract freezes both codes | facade `applyProposal` |
| Actions | in-memory dedup | **no** concurrent integration | idempotency contract |
| Unified Execute | idempotency key | **no** concurrent execute test | idempotency contract |

**There is no test that writes Arrange + TEP + Mobile + Actions + Unified on one tripId concurrently.**

## 2. New contract

`src/agent/contracts/cross-corridor-concurrency.contract.spec.ts` — freezes per-corridor signals and asserts Arrange source contains `CONTEXT_STALE`.

## 3. Reproduce

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/cross-corridor-concurrency.contract.spec.ts \
  src/trips/tep/utils/tep-repair-stale-guard.util.spec.ts \
  src/mobile/services/mobile-spatial-route.service.spec.ts
```

## 4. Limitations

- Phase2 e2e may fail under incomplete DI mocks in some environments — treat as PARTIAL if FAIL.
- Multi-instance TEP PG concurrency remains a documented product gap (`TEP-WRITE-CONCURRENCY-GATE.md`).
