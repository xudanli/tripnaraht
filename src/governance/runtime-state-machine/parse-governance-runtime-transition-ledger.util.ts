import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceRuntimeState } from './governance-runtime-state.types';
import type { GovernanceRuntimeTransitionEvent } from './governance-runtime-transition.types';

/** Shared parser for `governance_runtime_transition` rows (routeRegion JSON). */
export function parseGovernanceRuntimeTransitionLedgerPayload(
  e: GovernanceLedgerEvent,
): { from: GovernanceRuntimeState; to: GovernanceRuntimeState; event: GovernanceRuntimeTransitionEvent } | null {
  if (e.eventType !== 'governance_runtime_transition') return null;
  const raw = e.executionContextSummary?.routeRegion ?? '';
  try {
    const j = JSON.parse(raw) as {
      fromState?: GovernanceRuntimeState;
      toState?: GovernanceRuntimeState;
      event?: GovernanceRuntimeTransitionEvent;
    };
    if (!j.fromState || !j.toState || !j.event) return null;
    return { from: j.fromState, to: j.toState, event: j.event };
  } catch {
    return null;
  }
}
