import { SYSTEM_ORCHESTRATOR_ACTIONS } from '../../../constants/action-execution.constants';
import type { Itinerary } from '../../../interfaces/trip-plan.interface';
import {
  formatPlanGenInputsKernelZh,
  formatPlanGenOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { PlanGenPhaseHost, RunPlanGenPhaseParams } from './plan-gen-phase.host';

/**
 * PLAN_GEN 执行体：消费 context_build 后的 DSO，经 Kernel.executePlanGen 产出行程草案。
 */
export async function runPlanGenPhase(
  host: PlanGenPhaseHost,
  params: RunPlanGenPhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { decisionState, state, request, context, llmProvider } = params;

  if (
    host.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
    host.decisionKernel &&
    decisionState &&
    state.trip_plan_request
  ) {
    const stepStartTime = Date.now();
    let dsoForPlan = decisionState;
    if (
      dsoForPlan.systemState?.pendingMigrations?.length &&
      (dsoForPlan.tripState?.planDraft as { days?: unknown[] } | undefined)?.days?.length
    ) {
      dsoForPlan = host.decisionKernel.applyPrePlanMigrationInjections(dsoForPlan);
      state.decision_log.push({
        request_id: state.request_id,
        step: 'CONTEXT_BUILD',
        actor: 'Orchestrator',
        inputs_summary: '消费 DSO.systemState.pendingMigrations → 注入既有 planDraft',
        outputs_summary: `剩余待迁移条目=${dsoForPlan.systemState?.pendingMigrations?.length ?? 0}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: { duration_ms: 0 },
      });
    }
    const ctx = {
      requestId: state.request_id,
      tripPlanRequest: state.trip_plan_request,
      researchData: state.research_data,
      gateResult: state.gate_result as any,
    };
    const { newState, itinerary } = await host.decisionKernel.executePlanGen(dsoForPlan, ctx);
    host.syncOrchestratorFromDecisionState(newState, state);
    state.itinerary = itinerary as Itinerary;
    if (state.trip_plan_request && state.itinerary?.days?.length) {
      state.trip_plan_request = host.syncPlanRoutingMetricsToTripPlan(
        state.trip_plan_request,
        state.itinerary,
      );
    }
    state.current_step = 'PLAN_GEN';
    const pgFail = newState.systemState?.planGenTerminalFailure;
    state.decision_log.push({
      request_id: state.request_id,
      step: 'PLAN_GEN',
      actor: 'Planner',
      inputs_summary: formatPlanGenInputsKernelZh(),
      outputs_summary: formatPlanGenOutputsZh(
        itinerary.days.length,
        pgFail?.message ?? 'planGenTerminalFailure',
      ),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        ...(pgFail
          ? {
              system_action: SYSTEM_ORCHESTRATOR_ACTIONS.PLAN_GEN_EMPTY_DRAFT_HALT,
              planGenTerminalFailure: pgFail,
            }
          : {}),
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    await host.generateDecisionStepForStep(state, 'PLAN_GEN', 'Planner');
    host.onPlanGenDraftCaptured?.(state.request_id, state.itinerary as Itinerary);
    await host.collectTrajectoryAfterPlanGen({ request, state });
    return newState;
  }
  const legacyDso = await host.executePhaseViaKernel(decisionState, state, 'PLAN_GEN', () =>
    host.executePlanGenStep(request, context, state, llmProvider),
  );
  if (state.itinerary) {
    host.onPlanGenDraftCaptured?.(state.request_id, state.itinerary as Itinerary);
  }
  return legacyDso;
}
