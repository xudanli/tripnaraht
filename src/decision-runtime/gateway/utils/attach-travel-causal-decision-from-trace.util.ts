/**
 * Attach product TravelCausalDecision + decision card onto Unified Decision surfaces.
 */

import {
  projectCausalDecisionCard,
  type CausalDecisionCardView,
  type TravelCausalDecision,
} from '../../../travel-causal-decision';
import type { CanonicalCausalTraceV1 } from '../../../causal-protocol/causal-trace.types';

export interface TravelCausalDecisionAttachment {
  travelCausalDecision?: TravelCausalDecision;
  causalDecisionCard?: CausalDecisionCardView;
}

export function attachTravelCausalDecisionFromTrace(
  trace: CanonicalCausalTraceV1 | undefined,
): TravelCausalDecisionAttachment {
  const decision = trace?.travelCausalDecision;
  if (!decision) return {};
  return {
    travelCausalDecision: decision,
    causalDecisionCard: projectCausalDecisionCard(decision),
  };
}
