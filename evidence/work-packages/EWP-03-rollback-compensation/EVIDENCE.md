# EWP-03 — Rollback / Compensation fact matrix

**Status:** EVIDENCE_COMPLETE  
**Matrix v2 Claims:** C023, C023b–C023h  

| Corridor | Rollback / compensation | Path | Test status | Evidence level |
|----------|-------------------------|------|-------------|----------------|
| route_and_run / ITINERARY_ADJUST | Itinerary revision rollback HTTP | `agent.controller.ts` → `ItineraryRollbackService.rollbackToRevision` | `itinerary-rollback.service.spec.ts`, `agent.rollback.e2e.spec.ts` | PASS (revision path) |
| Unified | `POST .../decisions/:id/rollback` | `unified-decision.controller.ts` → `plan-version-apply.executor.rollback` | E2E executor specs (rfc001-v15 / iceland-*-l2); **no HTTP controller spec** | PARTIAL |
| Actions | Stub only | `action-execution.service.ts` `rollback` → message stub, no side effects | Api docs only | CODE_ONLY |
| Arrange | Discard proposal (pre-apply) | `arrange-itinerary.controller` discard | docs; no apply-rollback | PARTIAL (discard ≠ committed rollback) |
| Iceland Apply | **No** committed rollback evidenced | apply services write Trip/ItineraryItem | apply specs only | NEEDS_MORE_EVIDENCE |
| Mobile verified apply | **No** rollback evidenced | `mobile-in-trip-home` / controller | — | NEEDS_MORE_EVIDENCE |
| TEP Repair Apply | **Failure compensation**: materialization rollback + PlanVersion REJECTED | `tep-local-repair-apply.service.ts` catch | `tep-local-repair-apply.service.spec.ts` | PARTIAL (error path only) |
| OR-Tools Shadow | n/a (non-authoritative) | shadow guard / canary | shadow specs | CODE_ONLY / n/a |

## Reproduce

```bash
LLM_USE_MOCK=true npx jest --runInBand --forceExit \
  src/agent/contracts/rollback-compensation.corridor.matrix.spec.ts \
  src/decision-runtime/gateway/contracts/unified-rollback-http.contract.spec.ts \
  src/agent/contracts/actions-rollback-stub.product.contract.spec.ts \
  src/agent/services/itinerary-rollback.service.spec.ts
```

**RB-1 landed:** see `RB-1.md` (Unified HTTP chain + Actions `STUB_NO_SIDE_EFFECTS`).

## Limitations

- Do not treat Actions stub as production compensation.
- Do not evaluate Iceland Apply internal safety via absence of rollback (out of freeze or needs_audit separately).
