/**
 * Compacted view over recent governance events — avoids full replay for hot paths (v1 pure reducer).
 */

import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceRuntimeState } from '../runtime-state-machine/governance-runtime-state.types';
import { deriveGovernanceRuntimeStateFromLedger } from '../runtime-state-machine/derive-governance-runtime-state-from-ledger.util';
import { parseGovernanceResolutionLedgerPayload } from '../runtime-state-machine/governance-resolution-ledger.util';

/** Lifecycle-aware block refs (resolution may be filled by hydration heuristics or explicit ledger rows). */
export interface GovernanceUnresolvedBlock {
  ledgerEventId: string;
  resolutionEventId?: string;
  resolvedAt?: number;
}

export interface GovernanceSnapshot {
  compactedAt: number;
  tripId?: string;
  activeRestrictions: string[];
  unresolvedBlocks: GovernanceUnresolvedBlock[];
  dominantPolicies: string[];
  latestWorldRisks: string[];
  /** Ledger row ids that fed this snapshot (most recent first, capped). */
  sourceEventIds: string[];
  /** GRSM posture from full trip timeline (`governance_runtime_transition` rows). */
  runtimeState: GovernanceRuntimeState;
}

export function compactGovernanceSnapshot(
  events: readonly GovernanceLedgerEvent[],
  opts?: { tripId?: string; maxSourceEvents?: number },
): GovernanceSnapshot {
  const max = opts?.maxSourceEvents ?? 400;
  let list = [...events];
  if (opts?.tripId != null) {
    list = list.filter((e) => e.tripId === opts.tripId);
  }
  list.sort((a, b) => b.timestamp - a.timestamp);
  const slice = list.slice(0, max);
  const listAsc = [...list].sort((a, b) => a.timestamp - b.timestamp);

  const activeRestrictions: string[] = [];
  const unresolvedById = new Map<string, GovernanceUnresolvedBlock>();
  const dominantPolicies = new Set<string>();
  const latestWorldRisks: string[] = [];

  for (const e of listAsc) {
    for (const p of e.causedByPolicies ?? []) {
      dominantPolicies.add(p);
    }
    if (e.eventLevel === 'L3_world') {
      latestWorldRisks.push(e.eventType);
    }
    if (e.eventType === 'execution_block' || e.executionDecision.status === 'halt') {
      if (!unresolvedById.has(e.id)) unresolvedById.set(e.id, { ledgerEventId: e.id });
    }
    const ep = e.executionDecision.enforcedPolicies;
    if (ep && typeof ep === 'object') {
      if (ep['haltAutomatedExecution'] === true) activeRestrictions.push('halt_automated_execution');
      if (ep['denyLongDistanceAutorouting'] === true) activeRestrictions.push('deny_long_distance_autorouting');
      if (typeof ep['maxSingleLegDriveHours'] === 'number') {
        activeRestrictions.push(`max_single_leg_drive_hours:${ep['maxSingleLegDriveHours']}`);
      }
    }
  }

  for (const e of listAsc) {
    if (e.eventType !== 'governance_resolution_event') continue;
    const p = parseGovernanceResolutionLedgerPayload(e);
    if (!p?.resolvedLedgerEventId) continue;
    const cur = unresolvedById.get(p.resolvedLedgerEventId);
    if (cur) {
      unresolvedById.set(p.resolvedLedgerEventId, {
        ...cur,
        resolutionEventId: e.id,
        resolvedAt: e.timestamp,
      });
    }
  }

  const tripIdKey = opts?.tripId ?? '';
  const runtimeState = deriveGovernanceRuntimeStateFromLedger(listAsc, tripIdKey);

  return {
    compactedAt: Date.now(),
    tripId: opts?.tripId,
    activeRestrictions: [...new Set(activeRestrictions)],
    unresolvedBlocks: [...unresolvedById.values()],
    dominantPolicies: [...dominantPolicies],
    latestWorldRisks: [...new Set(latestWorldRisks)],
    sourceEventIds: slice.map((e) => e.id),
    runtimeState,
  };
}
