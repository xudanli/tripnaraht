import type { DecisionLogEntry, GateResult } from '../../interfaces/trip-plan.interface';
import {
  DECISION_TRAJECTORY_SCHEMA_ID,
  type DecisionTrajectoryOrchestrationStep,
  type DecisionTrajectoryV1,
} from '../interfaces/decision-trajectory.types';

export function buildInitialDecisionTrajectoryPayload(
  requestId: string,
  inputContext: DecisionTrajectoryV1['input_context'],
  axiomGate: DecisionTrajectoryV1['axiom_gate'],
  tripId?: string | null,
): DecisionTrajectoryV1 {
  return {
    schema_id: DECISION_TRAJECTORY_SCHEMA_ID,
    request_id: requestId,
    trip_id: tripId ?? inputContext.trip_id ?? null,
    input_context: inputContext,
    axiom_gate: axiomGate,
    orchestration_steps: [
      {
        step: 'GATE_EVAL',
        status: 'COMPLETED',
        timestamp_ms: Date.now(),
      },
    ],
  };
}

export function mergeOrchestrationSteps(
  existing: DecisionTrajectoryOrchestrationStep[],
  extra: DecisionTrajectoryOrchestrationStep[],
): DecisionTrajectoryOrchestrationStep[] {
  return [...existing, ...extra];
}

export function decisionLogToOrchestrationSteps(
  log: DecisionLogEntry[],
): DecisionTrajectoryOrchestrationStep[] {
  return log.map((entry) => ({
    step: String(entry.step),
    status: 'COMPLETED',
    timestamp_ms: entry.timestamp ? Date.parse(entry.timestamp) || Date.now() : Date.now(),
    duration_ms: entry.metadata?.duration_ms,
    actor: entry.actor,
  }));
}

export function decisionLogDigest(
  log: DecisionLogEntry[],
): DecisionTrajectoryV1['decision_log_digest'] {
  return log.map((e) => ({
    step: e.step,
    actor: e.actor,
    timestamp: e.timestamp,
  }));
}

export function gateResultToAxiomGate(gate: GateResult): DecisionTrajectoryV1['axiom_gate'] {
  return {
    gate_result: gate.gate_result,
    violations: gate.violations,
    required_adjustments: gate.required_adjustments,
    triggered_axiom_ids: (gate as { triggered_axiom_ids?: string[] }).triggered_axiom_ids,
    confidence: gate.confidence,
  };
}

/** @deprecated PR-B 请使用 `compileDebateArtifact` + Interlocutor 缓冲 */
export function debateFromGateResult(_gate?: GateResult): DecisionTrajectoryV1['debate_history'] | undefined {
  return undefined;
}
