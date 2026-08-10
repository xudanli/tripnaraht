/**
 * Agent Harness P0-1 W0 — frozen grandfather list of production files that still
 * contain ItineraryItem / itineraryItemsService mutations.
 *
 * CI (`npm run ci:forbid-legacy-itinerary-writes`) fails if any *new* file outside
 * this set gains a matching write. Shrinking this list is encouraged (W1+);
 * growing it requires an explicit ADR / allowlist PR edit.
 *
 * Generated baseline: 2026-07-24 (37 paths). Certification / ops lab excluded.
 */

export const LEGACY_ITINERARY_WRITE_ALLOWLIST = new Set<string>([
  'src/agent/assistants/planning-assistant/services/planning-assistant-v2.service.ts',
  'src/agent/assistants/trip-planner/services/trip-planner.service.ts',
  'src/agent/services/actions/trip.actions.ts',
  'src/agent/services/execution-agent.service.ts',
  'src/agent/services/system1-executor.service.ts',
  'src/agent/utils/plan-gate-timeline-materializer.util.ts',
  'src/decision-runtime/execution/authoritative-write/itinerary-adjust-canary.executor.ts',
  'src/guide-to-plan/services/guide-trip-materializer.service.ts',
  'src/itinerary-items/itinerary-items.controller.ts',
  'src/itinerary-items/itinerary-items.service.ts',
  'src/itinerary-items/services/item-cost.service.ts',
  'src/mobile/services/mobile-execution-write.service.ts',
  'src/route-directions/route-directions.service.ts',
  'src/skills/trip/trip-delete-item.skill.ts',
  'src/skills/trip/utils/trip-user-edit.util.ts',
  'src/travel-compiler/services/graph-effective-plan-materializer.service.ts',
  'src/trips/arrange-itinerary/services/arrange-itinerary-items.service.ts',
  'src/trips/attraction-explore/services/attraction-explore-auto-arrange.service.ts',
  'src/trips/execution-risk-center/utils/execution-risk-active-plan-materialize.util.ts',
  'src/trips/exploration/services/exploration-itinerary-seeder.service.ts',
  'src/trips/guardian-decision-core/execution/rfc001-itinerary-materializer.service.ts',
  'src/trips/readiness/services/trip-plan-persistence.service.ts',
  'src/trips/services/budget-evaluation.service.ts',
  'src/trips/services/schedule-converter.service.ts',
  'src/trips/services/trip-adjustment.service.ts',
  'src/trips/services/trip-conflicts.service.ts',
  'src/trips/services/trip-draft.service.ts',
  'src/trips/services/trip-extended.service.ts',
  'src/trips/services/trip-optimization.service.ts',
  'src/trips/services/trip-suggestions.service.ts',
  'src/trips/trip-constraint-solver/services/split-plan.service.ts',
  'src/trips/trip-constraint-solver/utils/apply-plan-object-repair.util.ts',
  'src/trips/trip-constraint-solver/utils/execution-advisory-apply.util.ts',
  'src/trips/trip-constraint-solver/utils/inter-day-buffer-repair.util.ts',
  'src/trips/trip-constraint-solver/utils/travel-timing-repair.util.ts',
  'src/trips/trips.controller.ts',
  'src/trips/trips.service.ts',
]);

/** Path prefixes skipped by the CI scanner (harness / lab / fixtures). */
export const LEGACY_ITINERARY_WRITE_SCAN_SKIP_SUBSTRINGS = [
  '/certification/',
  '/ops/lab/',
  '/fixtures/',
  'legacy-itinerary-write-allowlist.ts',
] as const;
