import type { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { applyGovernanceRuntimeTransition } from '../runtime-state-machine/apply-governance-runtime-transition.util';
import type { GovernanceRuntimeTransitionEvent } from '../runtime-state-machine/governance-runtime-transition.types';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';
import type { GovernanceBranchRuntimeOutcome } from './governance-branch-outcome.types';
import {
  buildGovernanceBranchOutcomeLedgerEvent,
  buildGovernanceBranchSelectedLedgerEvent,
} from './governance-branch-ledger.util';

function outcomeToGrsmEvent(outcome: GovernanceBranchRuntimeOutcome): GovernanceRuntimeTransitionEvent | null {
  switch (outcome) {
    case 'confirmation_requested':
      return 'execution_blocked';
    case 'execution_suppressed':
      return 'execution_suppressed';
    case 'replanning_deferred_plan_gen':
      return 'replanning_failed';
    case 'replanning_runtime_entered':
      return null;
    case 'governance_recovery_completed':
      return null;
    default:
      return null;
  }
}

export async function tryRecordGovernanceBranchSelectedWithGrsm(
  store: GovernanceLedgerStoreService | undefined,
  args: {
    tripId: string | null | undefined;
    requestId: string;
    directive: RuntimeBranchDirective;
    dryRun?: boolean;
  },
): Promise<void> {
  if (args.dryRun || !store || !args.tripId?.trim() || args.directive.branchType === 'normal_execution') return;
  store.appendEvent(
    buildGovernanceBranchSelectedLedgerEvent({
      tripId: args.tripId.trim(),
      requestId: args.requestId,
      directive: args.directive,
    }),
  );
  if (args.directive.branchType === 'replanning') {
    await applyGovernanceRuntimeTransition(store, {
      tripId: args.tripId.trim(),
      requestId: args.requestId,
      event: 'replanning_started',
      transitionReasonCodes: ['governance.branch_selected.replanning'],
      dryRun: args.dryRun,
    });
  }
}

export async function tryRecordGovernanceBranchOutcomeWithGrsm(
  store: GovernanceLedgerStoreService | undefined,
  args: {
    tripId: string | null | undefined;
    requestId: string;
    directive: RuntimeBranchDirective;
    outcome: GovernanceBranchRuntimeOutcome;
    dryRun?: boolean;
  },
): Promise<void> {
  if (args.dryRun || !store || !args.tripId?.trim()) return;
  store.appendEvent(
    buildGovernanceBranchOutcomeLedgerEvent({
      tripId: args.tripId.trim(),
      requestId: args.requestId,
      directive: args.directive,
      outcome: args.outcome,
    }),
  );
  const ev = outcomeToGrsmEvent(args.outcome);
  if (!ev) return;
  await applyGovernanceRuntimeTransition(store, {
    tripId: args.tripId.trim(),
    requestId: args.requestId,
    event: ev,
    transitionReasonCodes: [`governance.branch_outcome.${args.outcome}`],
    dryRun: args.dryRun,
  });
}
