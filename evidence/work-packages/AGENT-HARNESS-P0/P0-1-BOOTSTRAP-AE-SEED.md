# P0-1 / P1 — Bootstrap AE seed (EPWG-authorized)

**Date:** 2026-07-24  
**Scope:** Create-trip Item seeding under write chain without OCC unlock / new UWC / `assertDirect`  
**Pattern:** `runBootstrapPlanSeedWithAuthority(guard, caller, fn)` → chain OFF passthrough; chain ON + no guard → BadRequest; else `runWithAuthority('execute')` + `assertPlanMutationAllowedOrThrow`

---

## Surfaces

| Caller | Service method | Status |
|--------|----------------|--------|
| `trip-draft.createItineraryItemsFromDraft` | `TripDraftService.createItineraryItemsFromDraft` | **AUTHORIZED** |
| `route-directions.createTripFromTemplate` | `RouteDirectionsService.createTripFromTemplate` | **AUTHORIZED** |
| `trip-extended.importTripFromShare` | `TripExtendedService.importTripFromShare` | **AUTHORIZED** |

Util: `src/decision-runtime/execution/bootstrap-plan-seed-authority.util.ts`

---

## Why not assertDirect

`assertDirectEffectivePlanWriteBlocked` ignores ALS. Bootstrap create must still write Items when product UX creates a trip; ALS `runWithAuthority` is the correct grant (same family as DecisionCore AE materialize).

---

## Verification

```bash
npx jest src/decision-runtime/execution/bootstrap-plan-seed-authority.util.spec.ts --runInBand
npm run ci:forbid-legacy-itinerary-writes
```

---

## Still open (not this phase)

- OCC unlock (needs explicit authorization)
- Arrange ADD → UWC slice (**CLOSED** — `P0-1-ARRANGE-ADD-UWC-SLICE.md`)
- Confirm live multi-instance ERC cache proof
