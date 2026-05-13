import type { GovernanceLedgerEvent, GovernanceStateDiff } from './governance-ledger.types';

function lastEventAtOrBefore(
  eventsSortedAsc: readonly GovernanceLedgerEvent[],
  endMs: number,
): GovernanceLedgerEvent | undefined {
  let last: GovernanceLedgerEvent | undefined;
  for (const e of eventsSortedAsc) {
    if (e.timestamp <= endMs) last = e;
    else break;
  }
  return last;
}

function setDelta(a: string[] | undefined, b: string[] | undefined): { added: string[]; removed: string[] } {
  const A = new Set(a ?? []);
  const B = new Set(b ?? []);
  const added = [...B].filter((x) => !A.has(x));
  const removed = [...A].filter((x) => !B.has(x));
  return { added, removed };
}

function narrativeFromPolicyDelta(added: string[]): string[] {
  const hints: string[] = [];
  if (added.some((x) => /weather|wind|storm/i.test(x))) {
    hints.push('Possible weather escalation influencing execution posture.');
  }
  if (added.some((x) => /froad|f-road|2wd|vehicle/i.test(x))) {
    hints.push('Route or vehicle-class constraints tightened.');
  }
  if (added.some((x) => /safetravel/i.test(x))) {
    hints.push('SafeTravel or similar gate may have elevated blocking posture.');
  }
  return hints;
}

/**
 * Compares governance posture at two time horizons (e.g. “yesterday vs today”) for explainability.
 */
export function diffGovernanceStates(
  eventsSortedAsc: readonly GovernanceLedgerEvent[],
  tripId: string,
  opts: { baselineEndMs: number; comparisonEndMs: number },
): GovernanceStateDiff {
  const forTrip = eventsSortedAsc.filter((e) => e.tripId === tripId).sort((a, b) => a.timestamp - b.timestamp);
  const baseline = lastEventAtOrBefore(forTrip, opts.baselineEndMs);
  const current = lastEventAtOrBefore(forTrip, opts.comparisonEndMs);
  const summaryLines: string[] = [];
  if (!baseline && !current) {
    return {
      summaryLines: ['No governance events in range for this trip.'],
      narrativeHints: [],
    };
  }
  const bStatus = baseline?.executionDecision.status ?? 'unknown';
  const cStatus = current?.executionDecision.status ?? 'unknown';
  if (baseline && current && bStatus !== cStatus) {
    summaryLines.push(`Execution decision status changed: ${bStatus} → ${cStatus}.`);
  } else if (!baseline && current) {
    summaryLines.push(`First observed governance state: ${cStatus}.`);
  } else if (baseline && !current) {
    summaryLines.push('No governance snapshot at comparison horizon.');
  }
  const polDelta = setDelta(baseline?.causedByPolicies, current?.causedByPolicies);
  if (polDelta.added.length) {
    summaryLines.push(`New causal policy codes: ${polDelta.added.join(', ')}.`);
  }
  if (polDelta.removed.length) {
    summaryLines.push(`Resolved causal policy codes: ${polDelta.removed.join(', ')}.`);
  }
  if (baseline && current && baseline.eventType !== current.eventType) {
    summaryLines.push(`Primary governance event type changed: ${baseline.eventType} → ${current.eventType}.`);
  }
  return {
    summaryLines,
    baseline: baseline
      ? {
          timestamp: baseline.timestamp,
          eventType: baseline.eventType,
          executionDecision: baseline.executionDecision,
          causedByPolicies: baseline.causedByPolicies,
        }
      : undefined,
    current: current
      ? {
          timestamp: current.timestamp,
          eventType: current.eventType,
          executionDecision: current.executionDecision,
          causedByPolicies: current.causedByPolicies,
        }
      : undefined,
    narrativeHints: narrativeFromPolicyDelta(polDelta.added),
  };
}
