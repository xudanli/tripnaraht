# RFC-001 Phase 0 — Adapters (Phase 1)

## PR-A ✅ (implemented)

| File | Role |
|------|------|
| `evidence/road-status-changed.event.ts` | `ROAD_STATUS_CHANGED` envelope |
| `evidence/evidence-resolver.service.ts` | Resolve → persist assertion + snapshot |
| `evidence/world-state-store.service.ts` | `trip.metadata.rfc001WorldState` |
| `adapters/road-status-to-assertion.adapter.ts` | RoadStatus → `WorldStateAssertion` |

## Planned (PR-B+)

| Legacy source | Adapter | Target |
|---------------|---------|--------|
| `GateResult` / violations | `constraint-assertion.adapter.ts` | `Rfc001ConstraintAssertion[]` |
| VERIFY / fatigue | `load-assessment.adapter.ts` | `Rfc001LoadAssessment[]` |
| Neptune `updatedPlan` | `repair-candidate.adapter.ts` | `Rfc001RepairCandidate[]` |
| Decision Semantics V1.5 | `decision-record-bridge.adapter.ts` | `Rfc001DecisionRecord` |

**Rule:** Adapters are read/transform only until Decision Core finalize is wired into production paths.
