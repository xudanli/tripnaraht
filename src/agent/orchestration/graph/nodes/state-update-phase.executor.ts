import type { OrchestrationStep, SubAgentType } from '../../../interfaces/trip-plan.interface';
import {
  buildPatchFromDSOPrimary,
  decisionStateToOrchestratorState,
  orchestratorStateToDecisionStatePatch,
} from '../../../../decision/kernel/orchestrator-state-mapper';
import {
  extractDecisionLogTripContext,
  extractDestinationDisplayZh,
  formatStateUpdateInputsZh,
  formatStateUpdateOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { StateUpdatePhaseHost, RunStateUpdatePhaseParams } from './state-update-phase.host';

/**
 * STATE_UPDATE 执行体（自 claude-orchestrator 迁出）：DSO 原子提交 + worldStateSummary。
 */
export async function runStateUpdatePhase(
  host: StateUpdatePhaseHost,
  params: RunStateUpdatePhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { state, decisionState } = params;

    if (!host.decisionKernel || !decisionState) return decisionState;

    state.current_step = 'STATE_UPDATE';
    const stepStartTime = Date.now();
    host.logger.debug(`[Claude Orchestrator] 执行 STATE_UPDATE 步骤（原子提交）...`);

    const patch = host.isDsoAsPrimary()
      ? buildPatchFromDSOPrimary(decisionState, state)
      : orchestratorStateToDecisionStatePatch(state);
    patch.systemState = {
      ...patch.systemState,
      requestId: state.request_id,
      currentPhase: 'STATE_UPDATE',
      lastUpdatedAt: new Date().toISOString(),
    };
    host.applyPoiPlanningToPatch(patch, decisionState, state);
    // Scheme C: 世界模型三段式，从 patch + decisionState 构建 worldStateSummary（P3: research_data 补全，world.buildContext 优先）
    const { buildWorldStateSummaryFromDso } = await import('../../../../decision/kernel/world-state-summary.types');
    const mergedForSummary = {
      environmentState: patch.environmentState ?? decisionState.environmentState,
      userIntent: patch.userIntent ?? decisionState.userIntent,
    };
    const worldFromContext = host.extractWorldModelFromContextPackage(decisionState);
    const worldStateSummary = buildWorldStateSummaryFromDso(
      mergedForSummary,
      state.research_data,
      worldFromContext ?? (state as any).world_model_context,
    );
    if (Object.keys(worldStateSummary).length > 0) {
      patch.worldStateSummary = worldStateSummary;
    }

    const requestId = state.request_id;
    const getLatestState = host.dsoLatestStateProvider
      ? () => host.dsoLatestStateProvider!.getLatest(requestId)
      : undefined;

    // P3 A.1: 经 Kernel.executeStateUpdate 封装（原子提交 + 冲突回退）
    const { newState: updated } = await host.decisionKernel.executeStateUpdate(decisionState, patch, {
      getLatestState,
      maxRetries: 3,
    });

    // DSO 为主时：派生 OrchestratorState 兼容字段
    const derived = decisionStateToOrchestratorState(updated, state);
    Object.assign(state, derived);

    const intakeUserMessage =
      (state.metadata as { intake_user_message?: string } | undefined)?.intake_user_message ??
      state.trip_plan_request?.message;
    const tripCtx = extractDecisionLogTripContext({
      tripPlanRequest: state.trip_plan_request,
      userIntentDestination: patch.userIntent?.destination ?? decisionState.userIntent?.destination,
      metadata: state.metadata as Record<string, unknown>,
    });
    state.decision_log.push({
      request_id: state.request_id,
      step: 'STATE_UPDATE' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: formatStateUpdateInputsZh({
        userMessage: intakeUserMessage,
        destination: extractDestinationDisplayZh({
          userIntentDestination: patch.userIntent?.destination ?? decisionState.userIntent?.destination,
          tripPlanRequest: state.trip_plan_request,
        }),
        ctx: tripCtx,
      }),
      outputs_summary: formatStateUpdateOutputsZh({
        hasUserIntent: !!patch.userIntent,
        hasConstraints: !!patch.constraints,
        hasEnvironmentState: !!patch.environmentState,
        version: updated.systemState?.version,
        destinationBefore: decisionState.userIntent?.destination as unknown,
        destinationAfter: (patch.userIntent?.destination ?? updated.userIntent?.destination) as unknown,
        ctx: tripCtx,
      }),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        state_update_user_intent_destination: {
          before: decisionState.userIntent?.destination ?? null,
          after: patch.userIntent?.destination ?? updated.userIntent?.destination ?? null,
        },
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();

    return updated;
}
