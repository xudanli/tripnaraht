/**
 * Plan Decision State Shadow
 */

import { getPlanDecisionContract } from './plan-decision.contracts';
import { classifyPlanDecision } from './classify-plan-decision.util';
import { evaluateTransportRouteDecisionReadiness } from './evaluate-transport-route-decision-readiness.util';
import { runDecisionStateInvariants } from './decision-state.invariants';
import {
  projectTransportRouteDecisionState,
  type TransportRouteProjectionHints,
} from './project-transport-route-decision-state.util';
import type { DecisionStateShadowV1 } from './decision-state.types';

export function buildPlanDecisionShadow(input: {
  message: string;
  hints?: TransportRouteProjectionHints;
  legacy?: {
    creOperation?: string;
    creNextAction?: string;
    wouldAskUser?: boolean;
    blockKeys?: string[];
  };
}): DecisionStateShadowV1 {
  const tripId = input.hints?.tripId ?? null;
  const classified = classifyPlanDecision(input.message, tripId);
  const contract = classified.decisionClass
    ? getPlanDecisionContract(classified.decisionClass)
    : null;
  const hints: TransportRouteProjectionHints = {
    message: input.message,
    ...(input.hints ?? {}),
  };
  const projection =
    contract != null ? projectTransportRouteDecisionState(contract, hints) : null;
  const readiness =
    contract != null && projection != null
      ? evaluateTransportRouteDecisionReadiness(contract, projection)
      : null;

  const legacyWouldAsk = input.legacy?.wouldAskUser === true;
  const shadowNext = readiness?.nextAction ?? null;
  const divergenceCodes: string[] = [];
  if (legacyWouldAsk && shadowNext && shadowNext !== 'ASK_USER') {
    divergenceCodes.push('LEGACY_ASK_BUT_SHADOW_PROCEED');
  }
  if (
    input.legacy?.blockKeys?.some((k) => contract?.ignoredWorldKeys.includes(k))
  ) {
    divergenceCodes.push('LEGACY_BLOCKED_ON_IGNORED_KEY');
  }

  return {
    schema: 'tripnara.decision_state_contract_shadow@v1',
    mode: classified.decisionClass ? 'TAKEOVER_ELIGIBLE' : 'SHADOW_OBSERVE_ONLY',
    classified: {
      decisionClass: classified.decisionClass,
      confidence: classified.confidence,
      reason: classified.reason,
    },
    contract,
    projection,
    readiness,
    legacyCompare: {
      creOperation: input.legacy?.creOperation,
      creNextAction: input.legacy?.creNextAction,
      legacyWouldAskUser: legacyWouldAsk,
      shadowNextAction: shadowNext,
      divergenceCodes,
    },
    invariants: runDecisionStateInvariants({
      contract,
      projection,
      readiness,
      legacyBlockKeys: input.legacy?.blockKeys,
    }),
  };
}
