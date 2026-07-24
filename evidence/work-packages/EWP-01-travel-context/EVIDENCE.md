# EWP-01 — TravelContext & Web/iOS Context Projection

**Status:** EVIDENCE_COMPLETE (facts only)  
**Branch tip at capture:** `feat/v31-engineering-hardening`  
**Matrix v2 Claims:** C021, C021b, C025, C029  

## 1. Statement of facts

1. TravelContext (RFC-003) is implemented under `src/travel-context/` with snapshot, eight views, adapters, HTTP controller, and client types.
2. **Current runtime SSOT** remains `OrchestratorState + DecisionState/DSO`; TravelContext is **target** SSOT (not wired through Claude SM main chain). Source: `CURRENT_SSOT_STATUS.md` / `current-ssot-status.constants.ts`.
3. TravelContext concurrency fields are `revision` / `snapshotId` / `basedOnRevision` — **not** `contextHash` / `contextVersion`.
4. **No global `contextHash`** on `route_and_run` main chain (`AGENT_NO_GLOBAL_CONTEXT_HASH`).
5. Corridor-local hashes exist separately: Copilot Page Insight (`PageInsightContextHashService` → `ctxh_*`); Arrange/Iceland use `contextVersion` / local `contextHash`.
6. PageAIContract projections (`page-ai-contracts.ts`) are a **different** projection namespace from TravelContext view names.

## 2. Real paths

| Role | Path | Symbol |
|------|------|--------|
| SSOT status | `src/travel-context/CURRENT_SSOT_STATUS.md` | — |
| SSOT constants | `src/travel-context/current-ssot-status.constants.ts` | `CURRENT_RUNTIME_SSOT`, `TARGET_CONTEXT_SSOT` |
| Snapshot type | `src/travel-context/domain/travel-context.types.ts` | `TravelContextSnapshot`, `TravelContextViewEnvelope` |
| Views | `src/travel-context/projections/*` | `TravelContextProjectionResolverService` |
| HTTP | `src/travel-context/travel-context.controller.ts` | `getSnapshot`, `getView` |
| No global hash | `src/agent/contracts/agent-conceptual-vs-actual.constants.ts` | `AGENT_NO_GLOBAL_CONTEXT_HASH` |
| Page hash | `src/trips/copilot/services/page-insight-context-hash.service.ts` | `compute` |
| Page contracts | `src/trips/copilot/contracts/page-ai-contracts.ts` | `contextHashFields` |

## 3. Tests + reproduce

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/travel-context-projection.contract.spec.ts \
  src/travel-context/current-ssot-status.constants.spec.ts \
  src/travel-context/projections/all-views-projection.spec.ts \
  src/agent/contracts/agent-conceptual-vs-actual.constants.spec.ts \
  src/trips/copilot/services/page-insight-context-hash.service.spec.ts
```

Results: see `evidence/work-packages/EWP-01-travel-context/jest-results.json` after pack run.

## 4. Limitations

- No in-repo Web/iOS client source to prove page consumption of TravelContext views.
- HANDOFF docs do **not** name TravelContext; Copilot/Arrange handoffs cover separate context fields.
- Cannot claim TravelContext is the live main-chain SSOT.

## 5. Allowed research language

- “TravelContext exists as RFC-003 module; runtime SSOT remains OS∥DSO.”
- “No unified contextHash on main chain; local hashes exist per corridor (see CTX-1 inventory).”
- Not: “Web/iOS already projects TravelContext end-to-end” without client source.

**CTX-1 landed:** `CTX-1.md` / `corridor-local-freshness.inventory.ts`.
