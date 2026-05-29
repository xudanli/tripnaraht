import { decisionStateToOrchestratorState } from '../../../../decision/kernel/orchestrator-state-mapper';
import type { GateResult } from '../../../interfaces/trip-plan.interface';
import {
  formatGateEvalInputsKernelZh,
  formatGateEvalOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { GateEvalPhaseHost, RunGateEvalPhaseParams } from './gate-eval-phase.host';

/**
 * GATE_EVAL 执行体：Kernel 路径经 Harness 契约；失败时 Kernel 合成 BLOCK，不调用 gateEvalExecutor。
 */
export async function runGateEvalPhase(
  host: GateEvalPhaseHost,
  params: RunGateEvalPhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { decisionState, state, request, context, llmProvider } = params;

  if (
    host.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
    host.decisionKernel &&
    decisionState &&
    state.trip_plan_request
  ) {
    const stepStartTime = Date.now();
    const ctx = {
      requestId: state.request_id,
      routeDirectionId: request.route_direction_id ?? undefined,
      userId: request.user_id,
      tripPlanRequest: state.trip_plan_request,
      researchData: state.research_data,
    };
    const { newState, gateResult } = await host.decisionKernel.executeGateEval(decisionState, ctx);
    host.syncOrchestratorFromDecisionState(newState, state);
    state.gate_result = {
      gate_result: gateResult.gate_result,
      violations: gateResult.violations as GateResult['violations'],
      required_adjustments: gateResult.required_adjustments as GateResult['required_adjustments'],
      confidence: gateResult.confidence,
      evidence_refs: [],
    };
    state.current_step = 'GATE_EVAL';
    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: formatGateEvalInputsKernelZh(),
      outputs_summary: formatGateEvalOutputsZh(gateResult.gate_result, gateResult.violations.length),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: Date.now() - stepStartTime },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    await host.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
    host.enrichGuardianDebateTripContextAfterGateEval(state);
    host.applyMarathonPipelineSignals(state, request);
    await host.onGateEvalCompleted?.(state, request);
    return newState;
  }

  const gateEvalDecisionState = await host.executePhaseViaKernel(decisionState, state, 'GATE_EVAL', () =>
    host.executeGateEvalStep(request, context, state, llmProvider),
  );
  host.enrichGuardianDebateTripContextAfterGateEval(state);
  host.applyMarathonPipelineSignals(state, request);
  await host.onGateEvalCompleted?.(state, request);
  return gateEvalDecisionState;
}
