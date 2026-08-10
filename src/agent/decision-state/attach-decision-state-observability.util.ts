/**
 * Assembler：把 Decision State Shadow / Divergence 挂到 observability。
 */

import type { DecisionStateShadowV1 } from './decision-state.types';
import { serializeActivityDecisionShadow } from './activity-decision-shadow.util';

export function resolveDecisionStateContractObservability(input: {
  orchestrationResult?: { result?: unknown } | null;
  contextShadow?: DecisionStateShadowV1 | null;
}): {
  decision_state_contract_shadow?: Record<string, unknown>;
  decision_state_divergence_v1?: Record<string, unknown>;
} {
  const result = input.orchestrationResult?.result;
  const bag = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
  const fromResult = bag?.decisionStateShadow != null ? bag.decisionStateShadow : null;
  const divergence = bag?.decisionStateDivergence ?? null;

  const out: {
    decision_state_contract_shadow?: Record<string, unknown>;
    decision_state_divergence_v1?: Record<string, unknown>;
  } = {};

  if (fromResult && typeof fromResult === 'object') {
    out.decision_state_contract_shadow = fromResult as Record<string, unknown>;
  } else if (input.contextShadow?.classified?.decisionClass) {
    out.decision_state_contract_shadow = serializeActivityDecisionShadow(
      input.contextShadow,
    );
  }
  if (divergence && typeof divergence === 'object') {
    out.decision_state_divergence_v1 = divergence as Record<string, unknown>;
  }
  return out;
}
