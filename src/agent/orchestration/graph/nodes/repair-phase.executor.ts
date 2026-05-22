import {
  formatRepairInputsKernelZh,
  formatRepairOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { GuardianType, Itinerary } from '../../../interfaces/trip-plan.interface';
import type { RepairPhaseHost, RunRepairPhaseParams } from './repair-phase.host';

/**
 * REPAIR 执行体：消费 VerifyPhaseVerdict.needs_repair 后的 issues/errors，经 Kernel.executeRepair 闭环 Patch。
 */
export async function runRepairPhase(
  host: RepairPhaseHost,
  params: RunRepairPhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { decisionState, state, request, context, llmProvider } = params;

  if (
    host.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
    host.decisionKernel &&
    decisionState &&
    state.itinerary &&
    state.gate_result
  ) {
    const stepStartTime = Date.now();
    const ctx = {
      requestId: state.request_id,
      tripPlanRequest: state.trip_plan_request,
      researchData: state.research_data,
      gateResult: state.gate_result as any,
      itinerary: state.itinerary as any,
      alternatives: state.alternatives,
    };
    const { newState, itinerary, repairApplied } = await host.decisionKernel.executeRepair(
      decisionState,
      ctx,
    );
    host.syncOrchestratorFromDecisionState(newState, state);
    if (itinerary) state.itinerary = itinerary as Itinerary;
    if (repairApplied && state.trip_plan_request && state.itinerary?.days?.length) {
      const postRepair = host.applyPostRepairRoutingSync({
        trip: state.trip_plan_request,
        itinerary: state.itinerary,
        metadata: state.metadata as Record<string, unknown>,
        message: request?.message ?? state.trip_plan_request.message,
        routeAndRunIntent: (state.metadata as Record<string, unknown>)?.route_and_run_intent,
        clarificationAnswers: (state.metadata as Record<string, unknown>)?.clarification_answers,
      });
      state.trip_plan_request = postRepair.trip;
    }
    state.current_step = 'REPAIR';
    state.decision_log.push({
      request_id: state.request_id,
      step: 'REPAIR',
      actor: 'LocalInsight',
      inputs_summary: formatRepairInputsKernelZh(),
      outputs_summary: formatRepairOutputsZh(repairApplied),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        repair_applied: repairApplied,
        guardian: 'NEPTUNE' as GuardianType,
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    await host.generateDecisionStepForStep(state, 'REPAIR', 'LocalInsight');
    await host.recordRepairObservability({ newState, state, request });
    return newState;
  }
  return host.executePhaseViaKernel(decisionState, state, 'REPAIR', () =>
    host.executeRepairStep(request, context, state, llmProvider),
  );
}
