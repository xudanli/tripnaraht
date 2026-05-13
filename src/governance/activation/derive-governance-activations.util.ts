import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';
import type { GovernanceActivation, ReplanningIntent } from './governance-activation.types';

function hasRecent(
  events: readonly GovernanceLedgerEvent[],
  pred: (e: GovernanceLedgerEvent) => boolean,
  windowMs: number,
  now: number,
): boolean {
  return events.some((e) => pred(e) && now - e.timestamp <= windowMs);
}

/**
 * Derives activation intents from recent ledger + snapshot (read-only; orchestrator consumes).
 */
export function deriveGovernanceActivationsFromGovernance(args: {
  events: readonly GovernanceLedgerEvent[];
  snapshot: GovernanceSnapshot;
  now?: number;
}): GovernanceActivation[] {
  const now = args.now ?? Date.now();
  const out: GovernanceActivation[] = [];
  const tripScoped = args.snapshot.tripId
    ? args.events.filter((e) => e.tripId === args.snapshot.tripId)
    : [...args.events];

  const openBlocks = args.snapshot.unresolvedBlocks.filter((b) => b.resolvedAt == null);
  if (openBlocks.length > 0) {
    const ids = openBlocks.map((b) => b.ledgerEventId);
    const ri: ReplanningIntent = {
      trigger: 'execution_block',
      requiredActions: ['replan_corridor_or_vehicle_class', 'revalidate_readiness'],
      preservedConstraints: [],
      forbiddenStrategies: ['expand_long_distance_autoroute_until_cleared'],
      replanningScope: 'trip',
    };
    const risks = args.snapshot.latestWorldRisks;
    const routeInvalidated = risks.some((w) =>
      /storm_detected|weather_escalated|road_closed|official_warning_issued/i.test(w),
    );
    if (routeInvalidated) {
      ri.trigger = 'route_invalidated';
      ri.requiredActions.unshift('reroute_off_affected_segments');
      if (risks.some((w) => /storm_detected|weather_escalated|wind|weather/i.test(w))) {
        ri.requiredActions.unshift('defer_exposed_legs');
      }
    } else if (risks.some((w) => /weather|storm|wind/i.test(w))) {
      ri.trigger = 'weather_escalation';
      ri.requiredActions.unshift('defer_exposed_legs');
    }
    out.push({
      activationType: 'trigger_replanning',
      sourceEventIds: ids,
      rationale: [
        'Open execution governance blocks require replanning before automated expansion.',
        `Unresolved blocks: ${ids.length}`,
      ],
      activationConfidence: 0.82,
      replanningIntent: ri,
    });
  }

  if (
    hasRecent(
      tripScoped,
      (e) => e.eventType === 'storm_detected' || e.eventType === 'weather_escalated',
      1000 * 60 * 36,
      now,
    )
  ) {
    const worldIds = tripScoped.filter((e) => e.eventLevel === 'L3_world').map((e) => e.id);
    out.push({
      activationType: 'escalate_policy',
      sourceEventIds: worldIds.slice(0, 20),
      rationale: ['Recent world-tier weather pressure — bias policy resolver toward conservative routing.'],
      activationConfidence: 0.64,
    });
  }

  if (hasRecent(tripScoped, (e) => e.executionDecision.status === 'halt', 1000 * 60 * 12, now)) {
    const haltIds = tripScoped.filter((e) => e.executionDecision.status === 'halt').map((e) => e.id);
    out.push({
      activationType: 'suppress_execution',
      sourceEventIds: haltIds.slice(0, 30),
      rationale: ['Halt-class execution posture detected — freeze autonomous corridor expansion.'],
      activationConfidence: 0.78,
    });
  }

  if (args.snapshot.dominantPolicies.length >= 8 && openBlocks.length === 0) {
    out.push({
      activationType: 'require_confirmation',
      sourceEventIds: args.snapshot.sourceEventIds.slice(0, 5),
      rationale: ['High policy cardinality without open blocks — confirm human intent before major edits.'],
      activationConfidence: 0.42,
    });
  }

  return out;
}
