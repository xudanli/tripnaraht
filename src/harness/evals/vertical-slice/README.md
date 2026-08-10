# Authority Consistency — Vertical Slices

**能力边界：** [TRIPNARA-CAPABILITY-BOUNDARIES.md](../../../internal-docs/product/TRIPNARA-CAPABILITY-BOUNDARIES.md)

## Commands

```bash
# Strong-wind ontology + UWC write path
npx jest src/harness/evals/vertical-slice/strong-wind-authority.harness.spec.ts --runInBand

# Metadata → signals → Gateway DecisionScope closed loop
npx jest src/harness/evals/vertical-slice/weather-scope-signals-closed-loop.harness.spec.ts --runInBand
```

## Env (strong-wind test sets these)

| Var | Value |
|-----|--------|
| `ONTOLOGY_AUTHORITY_INTERNAL_GATE1` | `1` |
| `ONTOLOGY_AUTHORITY_ROLLOUT_MODE` | `ON` |
| Write chain | default ON |
| OR-Tools | Shadow only (not authoritative in slice) |

## Chains covered

### Strong-wind authority

Weather fact → rule inference → TemporalImpact → DecisionScope(shared snapshotId) → live `evaluateDecisionScopeBoundRun` → CanonicalApply seal → authorized UWC-path write delegate (`POST /api/uwc/v1/write/apply`) → Outcome reconcile.

Note: full UWC-1e Preview→Confirm→Apply HTTP stack lives on the UWC branch; this slice asserts the authorized-path binding without pulling that stack.

### Weather scope signals closed loop

Weather L2 stamp shape (`authorityDecisionScopeSignals`) → `buildTripWorldStateFromPrismaTrip` → `resolveDecisionScopeForGateway` → Verification allow/deny.
