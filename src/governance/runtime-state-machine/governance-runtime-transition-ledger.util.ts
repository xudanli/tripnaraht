import { randomUUID } from 'node:crypto';
import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { governanceEventLevelForType } from '../../agent/ledger/governance-ledger-event-level.util';
import { defaultExecutionDecision } from '../../world/operational/execution-governance.contract';
import type { GovernanceRuntimeState } from './governance-runtime-state.types';
import type { GovernanceRuntimeTransitionEvent } from './governance-runtime-transition.types';

export function buildGovernanceRuntimeTransitionLedgerEvent(args: {
  tripId: string;
  requestId: string;
  fromState: GovernanceRuntimeState;
  toState: GovernanceRuntimeState;
  event: GovernanceRuntimeTransitionEvent;
  transitionReasonCodes: string[];
}): GovernanceLedgerEvent {
  const id = randomUUID();
  const now = Date.now();
  const decision = { ...defaultExecutionDecision(), status: 'restricted' as const };
  decision.reasonCodes = [
    'governance.runtime.state_transition',
    `grsm.from.${args.fromState}`,
    `grsm.to.${args.toState}`,
    `grsm.event.${args.event}`,
    ...args.transitionReasonCodes,
  ];
  const payload = JSON.stringify({
    fromState: args.fromState,
    toState: args.toState,
    event: args.event,
    reasonCodes: args.transitionReasonCodes,
  });
  return {
    id,
    tripId: args.tripId,
    timestamp: now,
    eventLevel: governanceEventLevelForType('governance_runtime_transition'),
    eventType: 'governance_runtime_transition',
    correlationId: args.requestId,
    causalityChainId: args.requestId,
    executionDecision: decision,
    causedByPolicies: ['governance.runtime_state_machine@v1'],
    policyVersion: 'grsm@v1',
    affectedSubsystems: ['orchestration', 'planner'],
    executionContextSummary: {
      routeRegion: payload.slice(0, 480),
    },
  };
}
