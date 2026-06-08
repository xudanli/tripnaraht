/**
 * Narrator / NARRATE 阶段：orchestration decision_log + optimizationHints → unified envelope + 三人格投影。
 */

import type { DecisionLogEntry as AgentDecisionLogEntry } from '../../../agent/interfaces/trip-plan.interface';
import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';
import { buildRouteAndRunUnifiedExplain } from './build-route-and-run-unified-explain.util';
import {
  projectExplainForHumanFromEnvelope,
  type ExplainForHumanProjection,
} from './project-explain-for-human-from-envelope.util';
import type { UnifiedExplainabilityEnvelopeV1 } from './unified-explainability.types';

export interface NarratorUnifiedExplainResult {
  envelope: UnifiedExplainabilityEnvelopeV1;
  human: ExplainForHumanProjection;
}

export function buildNarratorUnifiedExplain(params: {
  requestId: string;
  orchestrationDecisionLog: AgentDecisionLogEntry[];
  optimizationHints?: OptimizationHints;
}): NarratorUnifiedExplainResult | undefined {
  const envelope = buildRouteAndRunUnifiedExplain({
    requestId: params.requestId,
    orchestrationDecisionLog: params.orchestrationDecisionLog,
    decisionState: params.optimizationHints
      ? ({ optimizationHints: params.optimizationHints } as import('../../../decision/kernel/decision-state.types').DecisionState)
      : undefined,
  });
  if (!envelope) return undefined;
  return {
    envelope,
    human: projectExplainForHumanFromEnvelope(envelope),
  };
}
