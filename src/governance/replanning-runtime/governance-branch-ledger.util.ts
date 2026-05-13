import { randomUUID } from 'node:crypto';
import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { governanceEventLevelForType } from '../../agent/ledger/governance-ledger-event-level.util';
import { defaultExecutionDecision } from '../../world/operational/execution-governance.contract';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';
import type { GovernanceBranchRuntimeOutcome } from './governance-branch-outcome.types';

function baseDecision(): ReturnType<typeof defaultExecutionDecision> {
  return { ...defaultExecutionDecision(), status: 'restricted' as const };
}

export function buildGovernanceBranchSelectedLedgerEvent(args: {
  tripId: string;
  requestId: string;
  directive: RuntimeBranchDirective;
}): GovernanceLedgerEvent {
  const id = randomUUID();
  const now = Date.now();
  const decision = baseDecision();
  decision.reasonCodes = [
    'governance.runtime.branch_selected',
    `governance.branch.${args.directive.branchType}`,
    ...args.directive.sourceActivationIds.slice(0, 12).map((s) => `governance.source.${s}`),
  ];
  return {
    id,
    tripId: args.tripId,
    timestamp: now,
    eventLevel: governanceEventLevelForType('governance_branch_selected'),
    eventType: 'governance_branch_selected',
    correlationId: args.requestId,
    causalityChainId: args.requestId,
    executionDecision: decision,
    causedByPolicies: ['governance.runtime.router@v1'],
    policyVersion: 'governance-runtime@v1',
    affectedSubsystems: ['orchestration', 'planner'],
    executionContextSummary: {
      routeRegion: JSON.stringify({
        branchType: args.directive.branchType,
        sourceActivationIds: args.directive.sourceActivationIds,
        replanningTrigger: args.directive.replanningIntent?.trigger,
      }).slice(0, 480),
    },
  };
}

export function buildGovernanceBranchOutcomeLedgerEvent(args: {
  tripId: string;
  requestId: string;
  directive: RuntimeBranchDirective;
  outcome: GovernanceBranchRuntimeOutcome;
}): GovernanceLedgerEvent {
  const id = randomUUID();
  const now = Date.now();
  const decision = baseDecision();
  decision.reasonCodes = [
    'governance.runtime.branch_outcome',
    `governance.outcome.${args.outcome}`,
    `governance.branch.${args.directive.branchType}`,
  ];
  return {
    id,
    tripId: args.tripId,
    timestamp: now,
    eventLevel: governanceEventLevelForType('governance_branch_outcome'),
    eventType: 'governance_branch_outcome',
    correlationId: args.requestId,
    causalityChainId: args.requestId,
    executionDecision: decision,
    causedByPolicies: ['governance.runtime.router@v1'],
    policyVersion: 'governance-runtime@v1',
    affectedSubsystems: ['orchestration'],
    executionContextSummary: {
      routeRegion: JSON.stringify({
        outcome: args.outcome,
        branchType: args.directive.branchType,
      }).slice(0, 480),
    },
  };
}
