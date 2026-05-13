import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceRecoveryQualityScore } from './governance-drift.types';
import { parseGovernanceRuntimeTransitionLedgerPayload } from '../runtime-state-machine/parse-governance-runtime-transition-ledger.util';
import { parseGovernanceResolutionLedgerPayload } from '../runtime-state-machine/governance-resolution-ledger.util';

/**
 * RQI v1: penalize recovery churn + resolution recurrence; reward short last recovery.
 */
export function computeGovernanceRecoveryQualityScore(
  events: readonly GovernanceLedgerEvent[],
  tripId: string,
): GovernanceRecoveryQualityScore {
  const scoped = events.filter((e) => (e.tripId ?? '') === tripId);
  const asc = [...scoped].sort((a, b) => a.timestamp - b.timestamp);

  let recoveryCycleCount = 0;
  let lastRecoveringEnterTs: number | undefined;
  let lastRecoveryDurationMs: number | undefined;

  for (const e of asc) {
    const tr = parseGovernanceRuntimeTransitionLedgerPayload(e);
    if (tr?.to === 'RECOVERING' && tr.event === 'replanning_succeeded') {
      recoveryCycleCount += 1;
      lastRecoveringEnterTs = e.timestamp;
    }
    if (tr?.from === 'RECOVERING' && tr.to === 'NORMAL' && tr.event === 'execution_resumed' && lastRecoveringEnterTs != null) {
      lastRecoveryDurationMs = e.timestamp - lastRecoveringEnterTs;
      lastRecoveringEnterTs = undefined;
    }
  }

  const resolutionCounts = new Map<string, number>();
  for (const e of asc) {
    if (e.eventType !== 'governance_resolution_event') continue;
    const p = parseGovernanceResolutionLedgerPayload(e);
    if (!p?.resolvedLedgerEventId) continue;
    resolutionCounts.set(p.resolvedLedgerEventId, (resolutionCounts.get(p.resolvedLedgerEventId) ?? 0) + 1);
  }
  let recurrenceCount = 0;
  for (const c of resolutionCounts.values()) {
    if (c > 1) recurrenceCount += c - 1;
  }
  const corridorKeys = new Map<string, number>();
  for (const e of asc) {
    if (e.eventType !== 'execution_block') continue;
    const k = normalizeCorridorKey(e.executionContextSummary?.routeRegion);
    if (!k) continue;
    corridorKeys.set(k, (corridorKeys.get(k) ?? 0) + 1);
  }
  let corridorRepeat = 0;
  for (const c of corridorKeys.values()) {
    if (c > 1) corridorRepeat += c - 1;
  }
  recurrenceCount = Math.max(recurrenceCount, corridorRepeat);

  let score = 1 - 0.12 * recoveryCycleCount - 0.18 * Math.min(recurrenceCount, 6);
  if (lastRecoveryDurationMs != null && lastRecoveryDurationMs > 0) {
    const hours = lastRecoveryDurationMs / 3_600_000;
    if (hours > 6) score -= 0.08;
    if (hours > 24) score -= 0.1;
  }
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    recoveryCycleCount,
    recurrenceCount,
    lastRecoveryDurationMs,
  };
}

function normalizeCorridorKey(routeRegion?: string): string {
  const s = (routeRegion ?? '').trim().toLowerCase().slice(0, 96);
  return s.length ? s : '';
}
