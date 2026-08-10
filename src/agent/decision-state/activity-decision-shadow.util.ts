/**
 * Activity Decision State Shadow（Phase 1）
 * 只观测：分类 → Contract → Projection → Readiness，不改变现网 ASK/分发。
 */

import { getActivityDecisionContract } from './activity-decision.contracts';
import { classifyActivityDecision } from './classify-activity-decision.util';
import { evaluateActivityDecisionReadiness } from './evaluate-activity-decision-readiness.util';
import { runDecisionStateInvariants } from './decision-state.invariants';
import {
  projectActivityDecisionState,
  type ActivityDecisionProjectionHints,
} from './project-activity-decision-state.util';
import type { DecisionStateShadowV1 } from './decision-state.types';

export type BuildActivityDecisionShadowInput = {
  message: string;
  hints?: ActivityDecisionProjectionHints;
  legacy?: {
    creOperation?: string;
    creNextAction?: string;
    /** 现链是否对用户发出追问 */
    wouldAskUser?: boolean;
    /** 现链阻断所引用的世界态键（如 day_pace） */
    blockKeys?: string[];
  };
};

export function buildActivityDecisionShadow(
  input: BuildActivityDecisionShadowInput,
): DecisionStateShadowV1 {
  const classified = classifyActivityDecision(input.message);
  const contract = classified.decisionClass
    ? getActivityDecisionContract(classified.decisionClass)
    : null;

  const hints: ActivityDecisionProjectionHints = {
    message: input.message,
    ...(input.hints ?? {}),
  };

  const projection =
    contract != null ? projectActivityDecisionState(contract, hints) : null;
  const readiness =
    contract != null && projection != null
      ? evaluateActivityDecisionReadiness(contract, projection)
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

  const invariants = runDecisionStateInvariants({
    contract,
    projection,
    readiness,
    legacyBlockKeys: input.legacy?.blockKeys,
  });

  return {
    schema: 'tripnara.decision_state_contract_shadow@v1',
    mode: 'SHADOW_OBSERVE_ONLY',
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
    invariants,
  };
}

export function serializeActivityDecisionShadow(
  shadow: DecisionStateShadowV1,
): Record<string, unknown> {
  return {
    schema: shadow.schema,
    mode: shadow.mode,
    decision_class: shadow.classified.decisionClass,
    confidence: shadow.classified.confidence,
    classify_reason: shadow.classified.reason,
    contract_version: shadow.contract?.version ?? null,
    projected_state: shadow.projection
      ? Object.fromEntries(
          shadow.projection.keys.map((k) => [
            k.key,
            { presence: k.presence, value: k.value ?? null, note: k.noteZh ?? null },
          ]),
        )
      : null,
    ignored_state: shadow.projection?.ignored.map((i) => i.key) ?? [],
    readiness: shadow.readiness?.readiness ?? null,
    next_action: shadow.readiness?.nextAction ?? null,
    reason_code: shadow.readiness?.reasonCode ?? null,
    ask_user_keys: shadow.readiness?.askUserKeys ?? [],
    warnings_zh: shadow.readiness?.warningsZh ?? [],
    legacy_compare: shadow.legacyCompare,
    invariants: shadow.invariants,
  };
}
