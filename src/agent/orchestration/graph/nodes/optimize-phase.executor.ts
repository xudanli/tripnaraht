import {
  extractDecisionLogTripContext,
  formatOptimizeInputsZh,
  formatOptimizeOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { OrchestrationStep, SubAgentType } from '../../../interfaces/trip-plan.interface';
import type { Itinerary } from '../../../interfaces/trip-plan.interface';
import type { OptimizePhaseHost, RunOptimizePhaseParams } from './optimize-phase.host';

/**
 * OPTIMIZE 执行体：成功路径非阻断微调，产出 optimizationHints。
 */
export async function runOptimizePhase(
  host: OptimizePhaseHost,
  params: RunOptimizePhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { state, decisionState } = params;
  if (!host.decisionKernel || !decisionState) return decisionState;

  state.current_step = 'OPTIMIZE';
  const stepStartTime = Date.now();
  host.logger.debug(`[Claude Orchestrator] 执行 OPTIMIZE 步骤...`);

  const planDraft = decisionState.tripState?.planDraft as Itinerary | undefined;
  const fatigue = host.computeOptimizeFatigue(planDraft);

  const { newState, optimizationHints: hints } = await host.decisionKernel.executeOptimize(
    decisionState,
    { fatigue },
  );

  const summarizeOptimizeOutputs = (): string => {
    if (!hints) return '本轮未产出数值型优化结论（可能跳过或降级）。';
    const ci = hints.confidenceInterval;
    return formatOptimizeOutputsZh({
      method: hints.method,
      recommendedId: hints.recommendedAlternativeId,
      altCount: hints.alternatives?.length ?? 0,
      expectedUtility: hints.expectedUtility,
      feasibilityProbability: hints.feasibilityProbability,
      ciLower: ci?.lower,
      ciUpper: ci?.upper,
      strategyDirection: hints.strategyDirection,
    });
  };

  const tripCtx = extractDecisionLogTripContext({
    tripPlanRequest: state.trip_plan_request,
    userIntentDestination: decisionState.userIntent?.destination,
    metadata: state.metadata as Record<string, unknown>,
    itinerary: planDraft,
  });

  state.decision_log.push({
    request_id: state.request_id,
    step: 'OPTIMIZE' as OrchestrationStep,
    actor: 'Orchestrator' as SubAgentType,
    inputs_summary: formatOptimizeInputsZh({
      dayCount: planDraft?.days?.length,
      ctx: tripCtx,
    }),
    outputs_summary: summarizeOptimizeOutputs(),
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      duration_ms: Date.now() - stepStartTime,
      guardian: 'DR_DRE',
      alternatives_considered: hints?.alternatives?.length ?? undefined,
      expected_utility: hints?.expectedUtility,
      feasibility_probability: hints?.feasibilityProbability,
      optimization_method: hints?.method,
    },
  });
  state.metadata.last_updated_at = new Date().toISOString();
  return newState;
}
