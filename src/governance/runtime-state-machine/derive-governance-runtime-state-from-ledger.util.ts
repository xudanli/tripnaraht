import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceRuntimeState } from './governance-runtime-state.types';
import { parseGovernanceRuntimeTransitionLedgerPayload } from './parse-governance-runtime-transition-ledger.util';

/**
 * Reconstructs current GRSM posture from durable ledger (`governance_runtime_transition` only).
 */
export function deriveGovernanceRuntimeStateFromLedger(
  events: readonly GovernanceLedgerEvent[],
  tripId: string,
): GovernanceRuntimeState {
  const scoped = events.filter((e) => (e.tripId ?? '') === tripId);
  let last: GovernanceRuntimeState = 'NORMAL';
  const asc = [...scoped].sort((a, b) => a.timestamp - b.timestamp);
  for (const e of asc) {
    const tr = parseGovernanceRuntimeTransitionLedgerPayload(e);
    if (tr) last = tr.to;
  }
  return last;
}
