import type { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { compactGovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';
import { deriveGovernanceRuntimeStateFromLedger } from './derive-governance-runtime-state-from-ledger.util';
import { applyGovernanceRuntimeTransition } from './apply-governance-runtime-transition.util';
import { buildGovernanceResolutionLedgerEvent } from './governance-resolution-ledger.util';
import {
  buildGovernanceBranchOutcomeLedgerEvent,
} from '../replanning-runtime/governance-branch-ledger.util';
import type { GovernanceRecoveryValidation } from './governance-recovery-validation.types';

export interface CompleteGovernanceRecoveryTransitionArgs {
  tripId: string;
  requestId: string;
  /** Pre-computed RVL output; closure only proceeds when valid and recommended NORMAL. */
  validation: GovernanceRecoveryValidation;
  /** Branch context for the terminal `governance_branch_outcome` row. */
  directiveForOutcome: RuntimeBranchDirective;
  /** Subset of open block ledger ids to resolve; default = all currently open (compact, no heuristic). */
  blockLedgerEventIdsToResolve?: string[];
  dryRun?: boolean;
}

/**
 * Recovery Continuation Closure (RCC) — single write authority for RECOVERING → NORMAL:
 * explicit block resolutions + `execution_resumed` + branch outcome.
 */
export async function completeGovernanceRecoveryTransition(
  store: GovernanceLedgerStoreService | undefined,
  args: CompleteGovernanceRecoveryTransitionArgs,
): Promise<{
  applied: boolean;
  fromState: string;
  toState: string;
  resolvedBlockIds: string[];
  skipReason?: string;
}> {
  const tripId = args.tripId?.trim();
  if (args.dryRun || !store || !tripId) {
    return { applied: false, fromState: 'UNKNOWN', toState: 'UNKNOWN', resolvedBlockIds: [], skipReason: 'dry_or_no_store' };
  }
  if (!args.validation.valid || args.validation.recommendedRuntimeState !== 'NORMAL') {
    return {
      applied: false,
      fromState: 'RECOVERING',
      toState: args.validation.recommendedRuntimeState,
      resolvedBlockIds: [],
      skipReason: 'rvl_not_clear_for_normal',
    };
  }

  const timeline = await store.replayGovernanceTimeline(tripId);
  const derived = deriveGovernanceRuntimeStateFromLedger(timeline, tripId);
  if (derived !== 'RECOVERING') {
    return {
      applied: false,
      fromState: derived,
      toState: derived,
      resolvedBlockIds: [],
      skipReason: 'grsm.not_recovering',
    };
  }

  const snap = compactGovernanceSnapshot(timeline, { tripId });
  const openBlocks = snap.unresolvedBlocks.filter((b) => b.resolvedAt == null).map((b) => b.ledgerEventId);
  const toResolve =
    args.blockLedgerEventIdsToResolve?.length ? args.blockLedgerEventIdsToResolve.filter(Boolean) : openBlocks;

  const resolvedBlockIds: string[] = [];
  for (const blockId of toResolve) {
    store.appendEvent(
      buildGovernanceResolutionLedgerEvent({
        tripId,
        requestId: args.requestId,
        resolvedLedgerEventId: blockId,
        resolutionKind: 'recovery_closure',
        reasonCodes: ['governance.rcc.recovery_closure', `governance.rcc.request.${args.requestId}`],
      }),
    );
    resolvedBlockIds.push(blockId);
  }

  const tr = await applyGovernanceRuntimeTransition(store, {
    tripId,
    requestId: args.requestId,
    event: 'execution_resumed',
    transitionReasonCodes: ['governance.rcc.execution_resumed', ...resolvedBlockIds.slice(0, 8).map((id) => `governance.rcc.resolved.${id}`)],
    dryRun: args.dryRun,
  });
  if (!tr.applied) {
    return {
      applied: false,
      fromState: tr.fromState,
      toState: tr.toState,
      resolvedBlockIds,
      skipReason: 'grsm.transition_rejected',
    };
  }

  store.appendEvent(
    buildGovernanceBranchOutcomeLedgerEvent({
      tripId,
      requestId: args.requestId,
      directive: args.directiveForOutcome,
      outcome: 'governance_recovery_completed',
    }),
  );

  return { applied: true, fromState: tr.fromState, toState: tr.toState, resolvedBlockIds };
}
