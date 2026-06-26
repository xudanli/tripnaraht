# Add Trip lifecycle runtime and Travel Event Store foundation

## Summary

Introduces Trip lifecycle runtime validation, in-process lifecycle events, and a feature-flagged append-only Travel Event Store for durable lifecycle auditing.

## What changed

- Extended Trip lifecycle statuses (`DRAFT`, `RECRUITING`, `FORMING`, `PLANNING`, `TRAVELING`, `COMPLETED`, `CANCELLED`; legacy `IN_PROGRESS` → `TRAVELING`)
- Added `TripLifecycleValidatorService` with positive-guard transition validation
- Added `TRIP_STATE_CHANGED` decision event and post-transaction emission from `TripsService.update()`
- Added append-only `travel_events` table (Prisma + migration)
- Added correct `TrajectorySegment = STATE | DECISION | ACTION | RESULT` (distinct from `TripStatus`)
- Added feature-flagged Travel Event Store (`TRAVEL_EVENT_STORE_ENABLED=false` by default)
- Persisted lifecycle state changes (`trip.lifecycle.state_changed`)
- Persisted rejected lifecycle transitions (`trip.lifecycle.transition_rejected`) with deterministic idempotency

## Commits

- `0e84d14` — Add Trip lifecycle runtime and Travel Event Store foundation
- `f0c0c33` — Persist rejected Trip lifecycle transitions

## Safety constraints

- `TRAVEL_EVENT_STORE_ENABLED=false` by default
- No production migration has been run
- No Recruiting Runtime included
- No payments/deposits included
- No collaboration event persistence included
- No replay/projection engine included
- Event persistence is fail-open (emit/persist failures do not change API responses)

## Testing

Phase 1 + Phase 2 foundation:

```bash
npm test -- --testPathPatterns="trip-status.dto|trip-lifecycle-validator|decision-events.trip-lifecycle|trips.service.lifecycle-events|travel-event-envelope|travel-event-subscriber|travel-event-persistence"
```

```
7 suites passed
89 tests passed
```

Phase 2B-1 scoped:

```bash
npm test -- --testPathPatterns="travel-event-transition-rejected|travel-event-subscriber|travel-event-envelope|trip-lifecycle-validator|trips.service.lifecycle-events|decision-events.trip-lifecycle"
```

```
6 suites passed
75 tests passed
```

Build:

```bash
npm run build
```

```
Build passed
```

## Deployment notes

- Production deployment requires staging migration verification or explicit backup-verified approval
- `IN_PROGRESS → TRAVELING` data migration (`prisma/migrations/migrate_trip_in_progress_to_traveling.sql`) must not be run directly on production without approval
- `travel_events` schema migration (`prisma/migrations/20260615140000_travel_event_store/`) must be applied on staging first
- Staging verification scripts: `scripts/verify-travel-event-store-staging.sh`, `scripts/verify-travel-event-store-staging.sql`
- Set `TRAVEL_EVENT_STORE_ENABLED=true` only after staging verification

## Known unrelated issues (out of scope)

- Typecheck unrelated errors elsewhere in the repo
- `TripDraftService` replay failure
- plan-gen `JwtAuthService` DI issue
- TensorFlow native binding issue
- Decision Flywheel timeout failures

## Files changed (27)

```
prisma/migrations/20260615140000_travel_event_store/migration.sql
prisma/migrations/migrate_trip_in_progress_to_traveling.sql
prisma/migrations/test_migrate_trip_in_progress_to_traveling.sql
prisma/schema.prisma
scripts/verify-travel-event-store-staging.sh
scripts/verify-travel-event-store-staging.sql
src/trips/decision/optimization/events/decision-events.trip-lifecycle.spec.ts
src/trips/decision/optimization/events/decision-events.ts
src/trips/dto/trip-status.dto.spec.ts
src/trips/dto/trip-status.dto.ts
src/trips/event-store/travel-event-envelope.builder.spec.ts
src/trips/event-store/travel-event-envelope.builder.ts
src/trips/event-store/travel-event-idempotency.util.ts
src/trips/event-store/travel-event-persistence.service.spec.ts
src/trips/event-store/travel-event-persistence.service.ts
src/trips/event-store/travel-event-store.config.ts
src/trips/event-store/travel-event-store.module.ts
src/trips/event-store/travel-event-subscriber.service.spec.ts
src/trips/event-store/travel-event-subscriber.service.ts
src/trips/event-store/travel-event-transition-rejected.spec.ts
src/trips/event-store/types/travel-event.types.ts
src/trips/services/trip-lifecycle-validator.service.spec.ts
src/trips/services/trip-lifecycle-validator.service.ts
src/trips/trips.controller.ts
src/trips/trips.module.ts
src/trips/trips.service.lifecycle-events.spec.ts
src/trips/trips.service.ts
```

## Push / PR commands (run after approval)

```bash
git push -u origin feat/trip-lifecycle-travel-event-store

gh pr create \
  --base master \
  --head feat/trip-lifecycle-travel-event-store \
  --title "Add Trip lifecycle runtime and Travel Event Store foundation" \
  --body-file .pr/trip-lifecycle-travel-event-store.md
```
