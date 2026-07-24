import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { GateResult, OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { DecisionTrajectoryInterlocutorService } from '../services/decision-trajectory-interlocutor.service';
import { gateResultToAxiomGate } from './decision-trajectory-payload.util';
import type { Itinerary } from '../../interfaces/trip-plan.interface';
import type { DecisionTrajectoryInputContext } from '../interfaces/decision-trajectory.types';
import { cloneItineraryForSnapshot, itineraryHasTopology } from './plan-gen-draft-snapshot.util';

export async function recordGateEvalTrajectoryDraft(
  interlocutor: DecisionTrajectoryInterlocutorService | undefined,
  state: OrchestratorState,
  request: RouteAndRunRequestDto,
): Promise<void> {
  if (!interlocutor?.isEnabled() || !state.gate_result) return;

  const inputContext: DecisionTrajectoryInputContext = {
    trip_id: request.trip_id ?? null,
    user_id: request.user_id ?? null,
    world_state_digest: {
      route_direction_id: request.route_direction_id,
      research_keys: state.research_data ? Object.keys(state.research_data).slice(0, 32) : [],
    },
    hard_constraints: state.trip_plan_request?.constraints
      ? [state.trip_plan_request.constraints]
      : undefined,
    operational_negative_constraints: (state.metadata as Record<string, unknown> | undefined)
      ?.operational_negative_constraints as Record<string, unknown> | undefined,
  };

  await interlocutor.upsertDraft(
    state.request_id,
    inputContext,
    gateResultToAxiomGate(state.gate_result),
  );
}

/**
 * PR-D：首次 PLAN_GEN 后冻结缺陷拓扑（仅记第一次，不被 REPAIR 覆盖）。
 */
export function recordPlanGenDraftSnapshot(
  interlocutor: DecisionTrajectoryInterlocutorService | undefined,
  requestId: string,
  itinerary: Itinerary | undefined,
): void {
  if (!interlocutor?.isEnabled() || !itineraryHasTopology(itinerary)) return;
  const snapshot = cloneItineraryForSnapshot(itinerary);
  if (snapshot) {
    interlocutor.capturePlanGenDraft(requestId, snapshot);
  }
}

export async function finalizeOrchestrationDecisionTrajectory(params: {
  interlocutor?: DecisionTrajectoryInterlocutorService;
  state: OrchestratorState;
  decisionState?: DecisionState;
  answerText?: string;
}): Promise<void> {
  const { interlocutor, state, decisionState, answerText } = params;
  if (!interlocutor?.isEnabled()) return;

  const harnessTracePath =
    decisionState?.harnessRuntime?.traceExportRelativePath ?? null;
  const harnessTraceId = decisionState?.harnessRuntime?.activeTraceId ?? null;

  const artifacts = interlocutor.buildFinalizeArtifactsFromOrchestration({
    state,
    answerText,
    harnessTracePath,
    harnessTraceId,
  });

  await interlocutor.finalize(state.request_id, {
    ...artifacts,
    harnessTracePath,
    harnessTraceId,
    decisionState,
  });
}
