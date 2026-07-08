# ADR: Canonical Causal Trace v1

**Status:** Accepted  
**Date:** 2026-07-06  
**Deciders:** Product / Architecture  

## Context

TripNARA has multiple runtimes that each explain causality (Iceland runtime, Readiness, Decision Checker, Planning BFF). Without a shared identity, the same wind event can produce inconsistent severity, scope, and recommendations across Guardian and the planning workbench.

## Decision

Establish a **Canonical Causal Trace** protocol — not a monolithic world-model service — so that Fact → Effect → Problem → Option → Outcome share `traceId` and `worldStateVersion`.

## Three SSOTs (non-negotiable)

| SSOT | Owns | Must NOT own |
|------|------|----------------|
| **TravelWorldFact / TripWorldState** | Weather, roads, bookings, members, time windows | Policy/Gate outcomes |
| **Decision Runtime** | Problems, options, decisions, execution records | Primary storage of weather/road facts |
| **Narrative Projection** | User-facing headline, assessment, persona tone | New causal inference |

## Five-tuple protocol (minimal v1)

1. **Facts** — `CausalFactRef[]` (refs to TravelWorldFact or adapter-normalized facts)
2. **Effects** — `CausalEffectV1[]` (propagation: wind → P90 → buffer → miss)
3. **Problems** — `CausalProblemRef[]` (Decision Problem binding)
4. **Options** — `CausalOptionRef[]` (preview predictions)
5. **Outcome** — `outcomeRef` after execute + calibration (P4)

## Identity lifecycle

```
PREVIEW → SELECTED → EXECUTING → EXECUTED → CALIBRATED
                ↘ STALE (when worldStateVersion changes)
```

- `traceId` — stable for one causal chain instance
- `worldStateVersion` — snapshot id (e.g. `ws_{tripVersion}`); execute MUST match preview unless re-evaluated
- **Idempotency** prevents duplicate apply; **worldStateVersion** prevents apply on a changed world

## BFF boundary

`planning-decision-causal-chain` is **Legacy Projection / Transitional Adapter**.

BFF MUST NOT: infer root cause, recalculate severity, merge fragments into canonical conclusions.  
BFF MAY: crop, sort, project `CanonicalCausalTraceV1` → `CausalStoryView`.

## First vertical slice

Iceland wind → segment P90 → booking buffer → Decision Problem → Option → Apply → Outcome.

Do NOT migrate visa/insurance/rental until slice DoD passes.

## Consequences

- Gateway Problem Detail, Option Preview, Apply responses gain optional `causalTraceRef`
- Stale guard returns `CAUSAL_TRACE_STALE` when execute world version ≠ preview
- Narrative unification (P2) consumes trace, not BFF inference

## References

- `src/causal-protocol/`
- `internal-docs/product/travel-ontology-world-model-v1.md`
