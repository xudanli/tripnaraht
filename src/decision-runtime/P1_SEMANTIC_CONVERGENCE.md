# P1 Semantic Convergence

> Status: Implemented (interfaces & defaults) · 2026-07-21  
> Scope: converge dual-run / dual-write / dual-engine **semantics** without directory refactor.

## Master switch

| Env | Effect |
|-----|--------|
| `P1_SEMANTIC_CONVERGENCE=1` | Force-on |
| `P1_SEMANTIC_CONVERGENCE=0` | Force-off |
| unset | **ON in `NODE_ENV=production`**, OFF otherwise |

Ops: `GET /api/ops/runtime/semantic-convergence`

## What converges

| Area | Before | After (P1 on) |
|------|--------|---------------|
| Constraint Gateway | Default `OFF`; SHADOW dual-run common | Default **`ON`** (single authority). Dual-run only if env explicitly `SHADOW_COMPARE` / `ON_FOR_SELECTED` |
| Decision Engine | Default `LEGACY` | Default **`CANONICAL`**. Legacy V1.5 remains FALLBACK reads; `listEnginesForNewSemanticWork()` excludes Legacy |
| Guide Accept | Canonical preferred; Legacy materialize fallback | **Requires Canonical**; no silent Legacy (`GUIDE_CANONICAL_ACCEPT_REQUIRED`). Legacy still P0 `LEGACY_CLOSED` |
| Decision Inbox | Multiple projections | **SSOT** = `UnifiedDecisionProblemReadModelService`; projections catalogued in `decision-inbox-semantics.ts` |
| PlanVersion | 5 colliding names | Taxonomy in `plan-version-semantics.ts` — do not mix IDs |
| Budget | Always dual-write `totalBudget`/`total` | **Canonical `budgetIntent` only**; `BUDGET_DUAL_WRITE_LEGACY=1` restores mirror |

## Escape hatches

- `CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE` — explicit dual-run
- `DECISION_RUNTIME_MODE=LEGACY` — force legacy runtime
- `GUIDE_CANONICAL_ACCEPT_EXECUTE=0` — disable canonical accept flag (P1 still blocks Legacy fallback)
- `BUDGET_DUAL_WRITE_LEGACY=1` — restore budget field mirror
- `P1_SEMANTIC_CONVERGENCE=0` — emergency off

## Code map

- `src/decision-runtime/p1-semantic-convergence.config.ts`
- `src/decision-runtime/p1-semantic-convergence-status.util.ts`
- `src/decision-runtime/plan-version-semantics.ts`
- `src/decision-runtime/decision-inbox-semantics.ts`
- `src/decision-runtime/constraints/constraint-gateway-mode.config.ts`
- `src/decision-runtime/constraints/constraint-evaluation.config.ts`
- `src/trips/budget-os/utils/budget-config.util.ts`
- `src/guide-to-plan/services/guide-to-plan.orchestrator.ts`
