# Evidence Work Packages (post V3.1 ACCEPT_NOW)

**Status:** EVIDENCE_COMPLETE (fact packs) — Matrix v2 remains **DRAFT** until signed  
**Purpose:** Real paths, tests, results, limitations, and Claim IDs — **not** target-architecture essays.  
**Follow-on:** After internal review of these packs, decide whether to open Context / Writeback / Rollback / Concurrency / BFF refactor tasks. Do **not** start those refactors from this pack alone.

| ID | Topic | Evidence | Matrix v2 Claims |
|----|-------|----------|------------------|
| EWP-01 | TravelContext + Context Projection | [EWP-01](./EWP-01-travel-context/EVIDENCE.md) | C021, C021b |
| EWP-02 | Mixed write targets | [EWP-02](./EWP-02-mixed-write-targets/EVIDENCE.md) | C022, C022b, C022c |
| EWP-03 | Rollback / Compensation | [EWP-03](./EWP-03-rollback-compensation/EVIDENCE.md) | C023, C023b–h |
| EWP-04 | Cross-corridor concurrency | [EWP-04](./EWP-04-cross-corridor-concurrency/EVIDENCE.md) | C024, C024b |
| EWP-05 | OR-Tools Shadow metrics | [EWP-05](./EWP-05-ortools-shadow-metrics/EVIDENCE.md) | C026, C026b |
| EWP-06 | Web/iOS protocol (backend) | [EWP-06](./EWP-06-client-protocol/EVIDENCE.md) | C025, C025b |
| EWP-07 | BFF + client contract matrix | [EWP-07](./EWP-07-bff-client-contracts/EVIDENCE.md) | C030, C030b |

## OR-Tools

RFC: `evidence/rfc/RFC-ORTools-Authoritative-Promotion.md` — **INTERNAL_REVIEW**, **Shadow retained**, authoritative Apply **not** authorized.

## Next process step

`POST_EWP_DECISION_GATE.md` — internal EL/TA/QA review before opening scoped tickets.  
Matrix v2 stays DRAFT until `../claim-evidence-matrix-v2/SIGNATURES.md` APPROVE.

## Batch reproduce

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/travel-context-projection.contract.spec.ts \
  src/agent/contracts/mixed-write-target.decomposition.contract.spec.ts \
  src/agent/contracts/rollback-compensation.corridor.matrix.spec.ts \
  src/agent/contracts/cross-corridor-concurrency.contract.spec.ts \
  src/decision-runtime/solver/lab/ortools-planning-lab-compare.sample.spec.ts \
  src/agent/contracts/client-protocol-handoff.inventory.contract.spec.ts \
  src/agent/contracts/bff-client-contract.matrix.spec.ts
```
