import { decisionStateToOrchestratorState } from '../../../../decision/kernel/orchestrator-state-mapper';
import type { GateResult } from '../../../interfaces/trip-plan.interface';
import {
  extractDecisionLogTripContext,
  extractDestinationDisplayZh,
  formatGateEvalInputsKernelZh,
  formatGateEvalOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { GateEvalPhaseHost, RunGateEvalPhaseParams } from './gate-eval-phase.host';
import { ensureHarnessResearchEvidenceSnapshot } from '../../../utils/harness-research-evidence-snapshot.util';
import { ensureHarnessPlanningInputsOnDecisionState } from '../../../utils/plan-gen-harness-input.util';
import {
  attachRelationAndFocusCognition,
  extractRelationGraphEnrichmentFromMetadata,
} from '../../../../decision/kernel/decision-cognition.util';
import { ensureGateCanonicalReality } from '../../../reality-observation/gate-canonical-reality.util';

function readGuardianVerdictsFromGateEval(gateResult: {
  guardian_results?: GateResult['guardian_results'];
}): { abu?: string; drdre?: string; neptune?: string } | undefined {
  const gr = gateResult.guardian_results;
  if (!gr) return undefined;
  return {
    abu: gr.abu?.verdict,
    drdre: gr.drdre?.verdict,
    neptune: gr.neptune?.verdict,
  };
}

/**
 * GATE_EVAL 执行体：Kernel 路径经 Harness 契约；失败时 Kernel 合成 BLOCK，不调用 gateEvalExecutor。
 */
export async function runGateEvalPhase(
  host: GateEvalPhaseHost,
  params: RunGateEvalPhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { decisionState, state, request, context, llmProvider } = params;
  let effectiveDecisionState = ensureHarnessResearchEvidenceSnapshot(
    decisionState,
    state.request_id,
    state.research_data as Record<string, unknown> | undefined,
  );

  const depthHint =
    context.requestRouterDecision?.decisionDepth ??
    ((state.metadata as Record<string, unknown> | undefined)?.decision_depth as
      | import('../../../../decision/kernel/decision-cognition.types').DecisionDepth
      | undefined);
  const gated = ensureGateCanonicalReality(
    effectiveDecisionState,
    context.realityObservationSnapshot,
    depthHint,
  );
  effectiveDecisionState = gated.decisionState;
  {
    const meta0 = (state.metadata ?? {}) as Record<string, unknown>;
    meta0.gate_reality_policy = gated.gateRealityPolicy;
    state.metadata = meta0 as typeof state.metadata;
  }

  if (
    host.isKernelNativeExecution({ request_id: state.request_id, user_id: request.user_id }) &&
    host.decisionKernel &&
    effectiveDecisionState &&
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
    const { newState, gateResult } = await host.decisionKernel.executeGateEval(effectiveDecisionState, ctx);
    // 认知层：关系图 + 聚焦问题（Gate 评判对象）；再投影到 OrchestratorState
    const withFocus = attachRelationAndFocusCognition(newState, {
      enrichment: extractRelationGraphEnrichmentFromMetadata(
        state.metadata as Record<string, unknown> | undefined,
      ),
      decisionDepth:
        context.requestRouterDecision?.decisionDepth ??
        ((state.metadata as Record<string, unknown> | undefined)?.decision_depth as
          | import('../../../../decision/kernel/decision-cognition.types').DecisionDepth
          | undefined),
    });
    host.syncOrchestratorFromDecisionState(withFocus, state);
    const meta = (state.metadata ?? {}) as Record<string, unknown>;
    meta.cognition_markers = withFocus.cognition?.markers ?? [];
    meta.focused_problem_id = withFocus.cognition?.focusedProblem?.problemId;
    state.metadata = meta as typeof state.metadata;
    if (!state.gate_result) {
      // 兼容：投影缺失时回落 Kernel 返回值（不应成为常态）
      state.gate_result = {
        gate_result: gateResult.gate_result,
        violations: gateResult.violations as GateResult['violations'],
        required_adjustments: gateResult.required_adjustments as GateResult['required_adjustments'],
        confidence: gateResult.confidence,
        evidence_refs: [],
      };
    }
    state.current_step = 'GATE_EVAL';
    const destinationLabel = extractDestinationDisplayZh({
      userIntentDestination: effectiveDecisionState.userIntent?.destination,
      tripPlanRequest: state.trip_plan_request,
    });
    const tripCtx = extractDecisionLogTripContext({
      tripPlanRequest: state.trip_plan_request,
      userIntentDestination: effectiveDecisionState.userIntent?.destination,
      metadata: state.metadata as Record<string, unknown>,
    });
    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: formatGateEvalInputsKernelZh({ destination: destinationLabel, ctx: tripCtx }),
      outputs_summary: formatGateEvalOutputsZh(
        gateResult.gate_result,
        gateResult.violations.length,
        readGuardianVerdictsFromGateEval(
          gateResult as { guardian_results?: GateResult['guardian_results'] },
        ),
      ),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        cognition_marker: withFocus.cognition?.focusedProblem
          ? 'PROBLEM_FOCUSED'
          : 'RELATIONS_READY',
        focused_problem_id: withFocus.cognition?.focusedProblem?.problemId,
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    await host.generateDecisionStepForStep(state, 'GATE_EVAL', 'Gatekeeper');
    host.enrichGuardianDebateTripContextAfterGateEval(state);
    host.applyMarathonPipelineSignals(state, request);
    await host.onGateEvalCompleted?.(state, request);
    const withSnapshot =
      ensureHarnessResearchEvidenceSnapshot(
        withFocus,
        state.request_id,
        state.research_data as Record<string, unknown> | undefined,
      ) ?? withFocus;
    return ensureHarnessPlanningInputsOnDecisionState(withSnapshot, state);
  }

  const gateEvalDecisionState = await host.executePhaseViaKernel(effectiveDecisionState, state, 'GATE_EVAL', () =>
    host.executeGateEvalStep(request, context, state, llmProvider),
  );
  host.enrichGuardianDebateTripContextAfterGateEval(state);
  host.applyMarathonPipelineSignals(state, request);
  await host.onGateEvalCompleted?.(state, request);
  const withSnapshot =
    ensureHarnessResearchEvidenceSnapshot(
      gateEvalDecisionState,
      state.request_id,
      state.research_data as Record<string, unknown> | undefined,
    ) ?? gateEvalDecisionState;
  return ensureHarnessPlanningInputsOnDecisionState(withSnapshot, state);
}
