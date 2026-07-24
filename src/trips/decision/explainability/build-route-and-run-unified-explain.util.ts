/**
 * route_and_run explain.unified 构建（orchestration log + kernel hints → envelope）。
 */

import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import { mapOrchestrationDecisionLogToTrips } from '../../../agent/utils/orchestration-to-trips-decision-log.util';
import type { DecisionLogEntry as AgentDecisionLogEntry } from '../../../agent/interfaces/trip-plan.interface';
import { buildUnifiedExplainabilityEnvelope } from './build-unified-explainability-envelope.util';
import { buildDeterministicNarrativeFromEnvelope } from './project-explain-for-human-from-envelope.util';
import type { UnifiedExplainabilityEnvelopeV1 } from './unified-explainability.types';
import type { WorldModelContext } from '../shared/world-model.types';
import type { PhysicalEvidenceGateMode } from '../contracts/physical-evidence-gate.util';

export function buildRouteAndRunUnifiedExplain(params: {
  requestId: string;
  orchestrationDecisionLog?: AgentDecisionLogEntry[];
  decisionState?: DecisionState;
  world?: WorldModelContext;
  physicalEvidenceGate?: PhysicalEvidenceGateMode;
}): UnifiedExplainabilityEnvelopeV1 | undefined {
  const tripsLogs = mapOrchestrationDecisionLogToTrips(params.orchestrationDecisionLog ?? [], {
    forExplain: true,
  });
  const hints = params.decisionState?.optimizationHints;
  if (tripsLogs.length === 0 && !hints) return undefined;

  const base = buildUnifiedExplainabilityEnvelope({
    requestId: params.requestId,
    traceId: params.requestId,
    decisionLogs: tripsLogs,
    optimizationHints: hints,
    physicalEvidenceGate: params.physicalEvidenceGate,
  });

  const narrative = buildDeterministicNarrativeFromEnvelope(base, params.world);
  return buildUnifiedExplainabilityEnvelope({
    requestId: params.requestId,
    traceId: params.requestId,
    decisionLogs: tripsLogs,
    optimizationHints: hints,
    narrative,
    physicalEvidenceGate: params.physicalEvidenceGate,
    generatedAt: base.generated_at,
  });
}
