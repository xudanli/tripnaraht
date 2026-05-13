import type { GovernanceHistoryQuery, GovernanceLedgerEvent, GovernanceLedgerEventType } from './governance-ledger.types';

/**
 * Pure filter over an append-only governance ledger (process-local or materialized view).
 */
export function queryGovernanceHistory(
  events: readonly GovernanceLedgerEvent[],
  q: GovernanceHistoryQuery,
): GovernanceLedgerEvent[] {
  const limit = q.limit ?? 100;
  let out = events.filter((e) => {
    if (q.tripId != null && e.tripId !== q.tripId) return false;
    if (q.sinceTimestamp != null && e.timestamp < q.sinceTimestamp) return false;
    if (q.eventTypes?.length && !q.eventTypes.includes(e.eventType)) return false;
    if (q.eventLevels?.length && !q.eventLevels.includes(e.eventLevel)) return false;
    if (q.routeRegion != null) {
      const r = e.executionContextSummary?.routeRegion;
      if (!r || !r.toLowerCase().includes(q.routeRegion.toLowerCase())) return false;
    }
    return true;
  });
  out = [...out].sort((a, b) => b.timestamp - a.timestamp);
  return out.slice(0, limit);
}

export function findRecentExecutionBlocks(
  events: readonly GovernanceLedgerEvent[],
  tripId: string,
  limit = 20,
): GovernanceLedgerEvent[] {
  return queryGovernanceHistory(events, {
    tripId,
    eventTypes: ['execution_block'] as GovernanceLedgerEventType[],
    limit,
  });
}

export function findPolicyOverrides(
  events: readonly GovernanceLedgerEvent[],
  tripId: string,
  limit = 50,
): GovernanceLedgerEvent[] {
  return queryGovernanceHistory(events, {
    tripId,
    eventTypes: ['policy_override'] as GovernanceLedgerEventType[],
    limit,
  });
}

export interface RepeatedRouteFailureHit {
  routeRegion: string;
  count: number;
  events: GovernanceLedgerEvent[];
}

/**
 * Surfaces repeated corridor / route-level governance friction for a region string (heuristic match).
 */
export function findRepeatedRouteFailures(
  events: readonly GovernanceLedgerEvent[],
  routeRegion: string,
  opts?: { minCount?: number; sinceTimestamp?: number },
): RepeatedRouteFailureHit | null {
  const minCount = opts?.minCount ?? 2;
  const needle = routeRegion.trim().toLowerCase();
  if (!needle) return null;
  const relevant = events.filter((e) => {
    if (opts?.sinceTimestamp != null && e.timestamp < opts.sinceTimestamp) return false;
    const r = e.executionContextSummary?.routeRegion?.toLowerCase() ?? '';
    if (!r.includes(needle)) return false;
    return e.eventType === 'execution_block' || e.eventType === 'route_suppressed';
  });
  if (relevant.length < minCount) return null;
  const sorted = [...relevant].sort((a, b) => b.timestamp - a.timestamp);
  return {
    routeRegion: sorted[0]?.executionContextSummary?.routeRegion ?? routeRegion,
    count: sorted.length,
    events: sorted,
  };
}
