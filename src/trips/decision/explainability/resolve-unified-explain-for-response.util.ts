/**
 * route_and_run explain.unified 与 NARRATE narration.unified_explainability 去重。
 */

import type { DecisionLogEntry as AgentDecisionLogEntry } from '../../../agent/interfaces/trip-plan.interface';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { NarrationLike } from '../../../decision/kernel/interfaces/phase-executor.interface';
import { buildRouteAndRunUnifiedExplain } from './build-route-and-run-unified-explain.util';
import {
  UNIFIED_EXPLAINABILITY_CONTRACT_VERSION,
  type UnifiedExplainabilityEnvelopeV1,
} from './unified-explainability.types';

export type UnifiedExplainSource = 'narration' | 'assembler';

export function resolveUnifiedExplainForRouteAndRunResponse(params: {
  requestId: string;
  orchestrationDecisionLog: AgentDecisionLogEntry[];
  decisionState?: DecisionState;
  narrationFromState?: NarrationLike | null;
}): UnifiedExplainabilityEnvelopeV1 | undefined {
  const fromNarration = params.narrationFromState?.unified_explainability;
  if (isReusableNarrationEnvelope(fromNarration, params.requestId)) {
    return fromNarration;
  }

  return buildRouteAndRunUnifiedExplain({
    requestId: params.requestId,
    orchestrationDecisionLog: params.orchestrationDecisionLog,
    decisionState: params.decisionState,
  });
}

export function resolveUnifiedExplainSource(params: {
  requestId: string;
  narrationFromState?: NarrationLike | null;
}): UnifiedExplainSource {
  const fromNarration = params.narrationFromState?.unified_explainability;
  return isReusableNarrationEnvelope(fromNarration, params.requestId) ? 'narration' : 'assembler';
}

function isReusableNarrationEnvelope(
  envelope: UnifiedExplainabilityEnvelopeV1 | undefined,
  requestId: string,
): envelope is UnifiedExplainabilityEnvelopeV1 {
  if (!envelope) return false;
  if (envelope.contract_version !== UNIFIED_EXPLAINABILITY_CONTRACT_VERSION) return false;
  return envelope.request_id === requestId || envelope.trace_id === requestId;
}
