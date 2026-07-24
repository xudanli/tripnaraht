# EWP-02 — Mixed write target decomposition

**Status:** EVIDENCE_COMPLETE  
**Matrix v2 Claims:** C022, C022b, C022c  

## 1. Matrix vs implementation

`WRITEBACK_CORRIDOR_AUDIT_MATRIX` marks `unified_execute` and `actions_commit` as `persistence: 'mixed'`. This package **splits** that label into concrete writers.

**WB-1 (landed):** the same lists are code SSOT as `UNIFIED_EXECUTE_MIXED_TARGETS` / `ACTIONS_COMMIT_MIXED_TARGETS` on the matrix rows (`mixedTargets`). See `WB-1.md`.

### Unified Execute (`POST /trips/:tripId/decisions/:decisionId/execute`)

| Target | Path | Symbol |
|--------|------|--------|
| PlanVersion snapshot / setEffective / recordExecution | `src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts` | `execute` / `executeAuthorized` |
| Decision ledger → EFFECTIVE | same | `ledgerStore.upsertDecision` |
| Problem store → RESOLVED | same | `problemStore.upsert` |
| ItineraryItem (flag-gated materializer) | same | `itineraryMaterializer.applyPlanOperations` |
| Trip.metadata revision markers | same | `bumpTripRevisionAndAppliedMarkers` |
| Optional rfc001_plan_versions table | `plan-version.store.ts` | dual-write |

### Actions Commit (`POST /agent/actions/commit`)

| Target | Path | Symbol |
|--------|------|--------|
| Action handler DB (per action) | `action-execution.service.ts` → `actionRegistry.execute` | e.g. `trip.applyEdit` → ItineraryItem |
| Prisma `agentActionLog` | `agent-action-log.service.ts` | saga log |
| Side-effect registry | `sideEffectRegistry.applyMany` | holds / financial |
| Trip.metadata physical validation | `persistPhysicalValidationSnapshot` | |
| Response ontology patch only | `buildTravelOntologyCommitExtension` | not authoritative DB by itself |
| In-memory dedup cache | `RequestDeduplicationService` | not durable |

## 2. Tests

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/writeback-corridor-audit.matrix.spec.ts \
  src/agent/contracts/mixed-write-target.decomposition.contract.spec.ts \
  src/decision-runtime/gateway/contracts/unified-execute-idempotency.contract.spec.ts \
  src/agent/contracts/actions-commit-idempotency.contract.spec.ts
```

## 3. Limitations

- Handler-level DB writes for Actions depend on registered action implementations; this pack does not enumerate every skill.
- Unified materializer path is flag-gated; presence of call site ≠ always-on write.

## 4. Research language

- Say: “mixed means multiple persistence targets listed above.”
- Do not say: “mixed is undefined” or invent a single write table.
