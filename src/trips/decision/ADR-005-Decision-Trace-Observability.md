# ADR-005: Decision trace observability (research mirror → logs)

## Status

Accepted (Iceland defense 1.0)

## Context

TripNARA 6.x needs **version-aligned** trace signals (`stability_mode_active`, `frustration_circuit_triggered`, `narrative_track`, audit threshold) in `decision_logs.metadata` without dirty-reading mutable World state. Agent research data may carry `__research_trace_signals`; the trips engine must snapshot that consensus for the planning tick and downstream logging.

## Decision

1. **Injection point:** Optional `TripContextState.orchestratorResearchData` — populated only by server-side orchestration before `generatePlan` / `repairPlan`.
2. **Tick sync:** `syncPlanResearchDataMirrorFromKernelResearch` copies into `TripWorldState.signals.planResearchDataMirror` when structured `__research_trace_signals` is present.
3. **Draft + logs:** `TripDecisionEngineService` attaches mirror to `RoutePlanDraft`; `StrategyOrchestratorService` maps via `mapResearchTraceSignalsToLogMetadata` into log metadata.

## Security & Governance

**`orchestratorResearchData` is internal-only.**

1. **Permission:** This field **must not** appear on any **public** API DTO (for example `GeneratePlanRequestDto` or other client-facing request bodies). Doing so would invite clients to forge trace signals (e.g. fake frustration) to steer compensation behavior.
2. **Source of truth:** Values **must** be produced by **server** orchestration (Strategy orchestrator, Kernel / Leader consensus merge, or equivalent backend paths), not by untrusted clients.
3. **Purpose:** Use only for **tick-scoped** mirror sync, **audit** metadata on decision logs, and **Narrator** semantic alignment. It is **not** a channel for user-driven injection of research trace semantics; user intent continues to flow through `preferences`, `constraints`, and other first-class inputs.

## Consequences

- New narrative tracks or trace fields can extend the mapper / PRD metadata without changing every business entrypoint, as long as the **server** still owns what gets written into `orchestratorResearchData`.
- RLHF / feedback pipelines may read the same mirror or persisted log metadata; they must treat it as **observed backend state**, not client input.

## References

- `src/trips/decision/shared/plan-research-mirror-sync.util.ts`
- `src/trips/decision/shared/research-trace-signals-log-metadata.util.ts`
- `src/trips/decision/shared/decision-log-metadata-prd.types.ts`
- `src/trips/decision/world-model.ts` — `TripContextState.orchestratorResearchData`
