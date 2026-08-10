/**
 * Lodging Decision State Shadow / Takeover 输入
 */

import { getLodgingDecisionContract } from './lodging-decision.contracts';
import { classifyLodgingDecision } from './classify-lodging-decision.util';
import { evaluateLodgingDecisionReadiness } from './evaluate-lodging-decision-readiness.util';
import { runDecisionStateInvariants } from './decision-state.invariants';
import {
  projectLodgingDecisionState,
  type LodgingDecisionProjectionHints,
} from './project-lodging-decision-state.util';
import type { DecisionStateShadowV1 } from './decision-state.types';

export type BuildLodgingDecisionShadowInput = {
  message: string;
  hints?: LodgingDecisionProjectionHints;
  legacy?: {
    creOperation?: string;
    creNextAction?: string;
    wouldAskUser?: boolean;
    blockKeys?: string[];
  };
};

export function buildLodgingDecisionShadow(
  input: BuildLodgingDecisionShadowInput,
): DecisionStateShadowV1 {
  const classified = classifyLodgingDecision(input.message);
  const contract = classified.decisionClass
    ? getLodgingDecisionContract(classified.decisionClass)
    : null;
  const hints: LodgingDecisionProjectionHints = {
    message: input.message,
    ...(input.hints ?? {}),
  };
  const projection =
    contract != null ? projectLodgingDecisionState(contract, hints) : null;
  const readiness =
    contract != null && projection != null
      ? evaluateLodgingDecisionReadiness(contract, projection)
      : null;

  const legacyWouldAsk = input.legacy?.wouldAskUser === true;
  const shadowNext = readiness?.nextAction ?? null;
  const divergenceCodes: string[] = [];
  if (legacyWouldAsk && shadowNext && shadowNext !== 'ASK_USER') {
    divergenceCodes.push('LEGACY_ASK_BUT_SHADOW_PROCEED');
  }
  if (!legacyWouldAsk && shadowNext === 'ASK_USER') {
    divergenceCodes.push('SHADOW_ASK_BUT_LEGACY_PROCEED');
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
