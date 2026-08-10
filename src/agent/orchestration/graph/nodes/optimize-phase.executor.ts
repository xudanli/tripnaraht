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

  // TMR CONSUME：metadata → DSO systemState（供 CGUS soft / contribution 证明）
  const metaHints = (
    state.metadata as { travelMemoryDecisionHints?: unknown } | undefined
  )?.travelMemoryDecisionHints;
  let optimizeInput = decisionState;
  if (
    Array.isArray(metaHints) &&
    metaHints.length > 0 &&
    !decisionState.systemState?.travelMemoryDecisionHints?.length
  ) {
    optimizeInput = {
      ...decisionState,
      systemState: {
        ...(decisionState.systemState ?? {
          requestId: state.request_id ?? decisionState.requestId ?? '',
        }),
        travelMemoryDecisionHints: metaHints as NonNullable<
          typeof decisionState.systemState
        >['travelMemoryDecisionHints'],
      },
    };
  }

  const { newState, optimizationHints: hints } = await host.decisionKernel.executeOptimize(
    optimizeInput,
    { fatigue },
  );

  if (hints?.memoryDecisionTrace && state.metadata) {
    (state.metadata as Record<string, unknown>).memory_decision_trace =
      hints.memoryDecisionTrace;
    const consumeObs = (state.metadata as Record<string, unknown>)
      .travel_memory_consume;
    if (consumeObs && typeof consumeObs === 'object') {
      (state.metadata as Record<string, unknown>).travel_memory_consume = {
        ...(consumeObs as Record<string, unknown>),
        contributionUsed: hints.memoryDecisionTrace.memoryContribution.used,
        contributionEligible: true,
        influenceKinds:
          hints.memoryDecisionTrace.memoryContribution.influence.map(
            (i) => i.influence,
          ),
      };
    }
  }
  if (hints?.tripShadowPair && state.metadata) {
    (state.metadata as Record<string, unknown>).trip_shadow_pair =
      hints.tripShadowPair;
  }

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
