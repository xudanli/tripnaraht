import type { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { deriveGovernanceRuntimeStateFromLedger } from './derive-governance-runtime-state-from-ledger.util';
import { buildGovernanceRuntimeTransitionLedgerEvent } from './governance-runtime-transition-ledger.util';
import { resolveGovernanceRuntimeTransitionTarget } from './governance-runtime-transition-table.util';
import type { GovernanceRuntimeState } from './governance-runtime-state.types';
import type { GovernanceRuntimeTransitionEvent } from './governance-runtime-transition.types';

export interface ApplyGovernanceRuntimeTransitionArgs {
  tripId: string;
  requestId: string;
  event: GovernanceRuntimeTransitionEvent;
  transitionReasonCodes: string[];
  /** When false, caller must have exclusive write path (tests). */
  dryRun?: boolean;
}

/**
 * **Single mutation authority** for GRSM: validates (derivedFromState, event), appends `governance_runtime_transition`.
 */
export async function applyGovernanceRuntimeTransition(
  store: GovernanceLedgerStoreService | undefined,
  args: ApplyGovernanceRuntimeTransitionArgs,
): Promise<{ fromState: GovernanceRuntimeState; toState: GovernanceRuntimeState; applied: boolean }> {
  if (args.dryRun || !store || !args.tripId.trim()) {
    return { fromState: 'NORMAL', toState: 'NORMAL', applied: false };
  }
  const timeline = await store.replayGovernanceTimeline(args.tripId.trim());
  const derived = deriveGovernanceRuntimeStateFromLedger(timeline, args.tripId.trim());
  const to = resolveGovernanceRuntimeTransitionTarget(derived, args.event);
  if (!to) {
    return { fromState: derived, toState: derived, applied: false };
  }
  store.appendEvent(
    buildGovernanceRuntimeTransitionLedgerEvent({
      tripId: args.tripId.trim(),
      requestId: args.requestId,
      fromState: derived,
      toState: to,
      event: args.event,
      transitionReasonCodes: args.transitionReasonCodes,
    }),
  );
  return { fromState: derived, toState: to, applied: true };
}
