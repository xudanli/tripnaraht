# Initial Plan Seed Pipeline (Golden Set → Arrange Input)

## Contract

```text
Trip Context
→ Region / Corridor Detection
→ Golden Set Candidate Seeding   (IcelandInitialPlanSeedService)
→ Catalog Entity Resolution      (IcelandGoldenSetCatalogResolver)
→ Gate Evaluation
→ Candidate Scoring
→ Arrange Input Projection       (IcelandInitialPlanArrangeProjector)
→ [Preview → Confirm → Apply]    ← not in this service
→ PlanVersion                    ← never written by seed
```

## Entry

```ts
// After create collects trip context / tripId:
IcelandInitialPlanPipelineService.buildArrangeInputFromCreate({
  tripId,
  dto, // CreateIcelandSelfDriveTripDto
  vehicleProfile,
  preferences,
})

// Or raw seed input:
IcelandInitialPlanPipelineService.buildArrangeInput(input)
```

Returns `{ seed, arrange }` where:

- `arrange.writesPlanVersion === false`
- `arrange.requiresPreviewConfirmApply === true`
- Experiences are `NEEDS_BOOKING_VERIFICATION` only
- Create HTTP BFF (when restored) must call this **before** solver arrange; Apply remains Preview→Confirm→Apply

## Create hook (expected)

```text
createTrip shell
→ buildArrangeInputFromCreate
→ solver arrange (consume arrange.attractionCandidates + relations + dayScopeRules)
→ constraint verification
→ Initial Plan Proposal (with SeededPlanItemEvidence)
→ user confirm
→ PlanVersion   ← never from seed/pipeline
```

## Key rules

| Rule | Behavior |
|------|----------|
| PRIMARY | Score boost, not must-include |
| TOWN_HUB / SUPPLY / GATEWAY | Route support; `countsTowardAttractionCoverage=false` |
| ALIAS_OF | Excluded before candidates |
| PARENT_CHILD | Child does not double-count coverage |
| SOFT_ALTERNATIVE | Both allowed; time-pressure trim with evidence |
| CO_VISIT_CLUSTER | Projected for same-day preference |
| East Fjords | `REGIONAL_CATALOG_GAP` + corridor only |
| Highlands | Blocked without 4WD / F-road evidence |

## Next

See [`INITIAL_PLAN_INDEPENDENT_VERIFY.md`](./INITIAL_PLAN_INDEPENDENT_VERIFY.md) and [`INITIAL_PLAN_PREVIEW_HTTP.md`](./INITIAL_PLAN_PREVIEW_HTTP.md).
