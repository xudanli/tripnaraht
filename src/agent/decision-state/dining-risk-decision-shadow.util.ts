/**
 * Dining / Risk Decision State Shadow
 */

import { getDiningRiskDecisionContract } from './dining-risk-decision.contracts';
import { classifyDiningRiskDecision } from './classify-dining-risk-decision.util';
import { evaluateDiningRiskDecisionReadiness } from './evaluate-dining-risk-decision-readiness.util';
import { runDecisionStateInvariants } from './decision-state.invariants';
import {
  projectDiningRiskDecisionState,
  type DiningRiskProjectionHints,
} from './project-dining-risk-decision-state.util';
import type { DecisionStateShadowV1 } from './decision-state.types';

export type BuildDiningRiskDecisionShadowInput = {
  message: string;
  hints?: DiningRiskProjectionHints;
  legacy?: {
    creOperation?: string;
    creNextAction?: string;
    wouldAskUser?: boolean;
    blockKeys?: string[];
  };
};

export function buildDiningRiskDecisionShadow(
  input: BuildDiningRiskDecisionShadowInput,
): DecisionStateShadowV1 {
  const classified = classifyDiningRiskDecision(input.message);
  const contract = classified.decisionClass
    ? getDiningRiskDecisionContract(classified.decisionClass)
    : null;
  const hints: DiningRiskProjectionHints = {
    message: input.message,
    ...(input.hints ?? {}),
  };
  const projection =
    contract != null ? projectDiningRiskDecisionState(contract, hints) : null;
  const readiness =
    contract != null && projection != null
      ? evaluateDiningRiskDecisionReadiness(contract, projection)
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
