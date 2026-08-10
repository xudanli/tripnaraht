# Iceland Initial Plan Proposal V1

## Goal

```text
Create Trip Context
→ Golden Set Seed
→ Arrange Input
→ Solver Adapter + Day Assign
→ Verify (+ ≤1 Repair)
→ Initial Plan Proposal Preview
```

**Never writes PlanVersion.** Confirm/Apply remains a later phase.

## Entry

```ts
IcelandTripCreateOrchestrator.buildInitialPlanProposal(command)
```

Returns `BuildInitialPlanProposalResult` with `status`, `proposal`, `verification`, `arrangeInputHash`, `decisions`.

## Solver Adapter

`IcelandInitialPlanSolverAdapter.adapt(arrange, ctx)` maps:

| Arrange | Solver |
|---------|--------|
| PRIMARY/SECONDARY score | node reward |
| user_request | mandatory node |
| Gate BLOCK | forbidden |
| PARENT_CHILD | hard same-day cluster |
| CO_VISIT_CLUSTER | soft same-day preference |
| SOFT_ALTERNATIVE | soft competing (trim under pressure) |
| dayScopeRules | one subregion / pack / day |
| Experiences | optional + NEED_CONFIRM |

Authority strategy for V1: **`ICELAND_COVERAGE_DAY_ASSIGN@v1`** (deterministic, relation-aware). Produces `SolverCandidate` compatible with `tripnara.solver_response@v1`.

## Verify

`IcelandInitialPlanVerifyService` checks gate rejects, parent-child orphans, day-scope, highlands mixing, then maps to:

`VERIFIED` | `VERIFIED_WITH_CONFIRMATIONS` | `REPAIR_REQUIRED` | `INFEASIBLE`

Max **1** repair pass.

## Files

- `types/iceland-initial-plan-proposal.types.ts`
- `services/iceland-initial-plan-solver.adapter.ts`
- `services/iceland-initial-plan-day-assign.solver.ts`
- `services/iceland-initial-plan-verify.service.ts`
- `services/iceland-initial-plan-proposal.builder.ts`
- `services/iceland-trip-create.orchestrator.ts`
- `services/iceland-initial-plan-proposal.e2e.spec.ts`
