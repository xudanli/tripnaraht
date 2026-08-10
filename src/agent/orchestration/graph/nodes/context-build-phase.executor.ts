import type { OrchestrationStep, SubAgentType } from '../../../interfaces/trip-plan.interface';
import {
  extractDecisionLogTripContext,
  formatContextBuildInputsZh,
  formatContextBuildOutputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { ContextBuildPhaseHost, RunContextBuildPhaseParams } from './context-build-phase.host';
import { attachRealityCognition } from '../../../../decision/kernel/decision-cognition.util';

/**
 * CONTEXT_BUILD 执行体：聚合干净 DSO，经 Kernel.executeContextBuild 装配 Planner 上下文包。
 * 出口附着 REALITY_BUILD 认知切片（RealitySnapshot）。
 */
export async function runContextBuildPhase(
  host: ContextBuildPhaseHost,
  params: RunContextBuildPhaseParams,
): Promise<import('../../../../decision/kernel/decision-state.types').DecisionState | undefined> {
  const { request, context, state, decisionState } = params;
  if (!host.decisionKernel || !decisionState) {
    return decisionState;
  }

  state.current_step = 'CONTEXT_BUILD';
  const stepStartTime = Date.now();
  host.logger.debug(`[Claude Orchestrator] 执行 CONTEXT_BUILD 步骤...`);

  const tripId = state.metadata?.tripId as string | undefined;
  const destinationCountryCode =
    !tripId && request.message ? host.extractCountryCodeFromMessage(request.message) : undefined;
  const memoryNationality = host.memoryPort?.getTravelerNationality();
  const overrides = {
    tripId,
    userId: state.metadata?.userId as string | undefined,
    userQuery: request.message,
    phase: 'PLANNING' as const,
    agent: 'PLANNER' as const,
    destinationCountryCode,
    abortSignal: context.abortSignal,
    travelerNationality: memoryNationality,
    dsoVersion: decisionState.systemState?.version,
    requestId: decisionState.systemState?.requestId ?? state.request_id,
  };

  const tripCtx = extractDecisionLogTripContext({
    tripPlanRequest: state.trip_plan_request,
    userIntentDestination: decisionState.userIntent?.destination,
    metadata: state.metadata as Record<string, unknown>,
  });

  try {
    const { newState, contextPackage: pkg } = await host.decisionKernel.executeContextBuild(
      decisionState,
      overrides,
    );
    const withReality = attachRealityCognition(newState, {
      decisionDepth:
        context.requestRouterDecision?.decisionDepth ??
        ((state.metadata as Record<string, unknown> | undefined)?.decision_depth as
          | import('../../../../decision/kernel/decision-cognition.types').DecisionDepth
          | undefined),
      preferredSnapshot: context.realityObservationSnapshot?.decisionSnapshot,
    });
    const meta = (state.metadata ?? {}) as Record<string, unknown>;
    meta.cognition_markers = withReality.cognition?.markers ?? [];
    if (context.realityObservationSnapshot) {
      meta.ror_observation_id = context.realityObservationSnapshot.observationId;
      meta.ror_operation = context.realityObservationSnapshot.operation;
      meta.reality_load_mode = 'CANONICAL_ONLY';
      /** Suggest 侧可另取；不写入 Gate 用 cognition */
      meta.ror_latent_count = context.realityObservationSnapshot.latentHypotheses.length;
    }
    state.metadata = meta as typeof state.metadata;
    state.decision_log.push({
      request_id: state.request_id,
      step: 'CONTEXT_BUILD' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: formatContextBuildInputsZh(request.message, tripCtx),
      outputs_summary: formatContextBuildOutputsZh((pkg as { blocks?: unknown[] })?.blocks?.length ?? 0, !pkg),
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        duration_ms: Date.now() - stepStartTime,
        cognition_marker: 'REALITY_READY',
        reality_source: context.realityObservationSnapshot ? 'ROR' : 'DSO_DERIVED',
        ror_observation_id: context.realityObservationSnapshot?.observationId,
      },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    return withReality;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    host.logger.warn(`[Claude Orchestrator] CONTEXT_BUILD 失败: ${msg}`);
    state.decision_log.push({
      request_id: state.request_id,
      step: 'CONTEXT_BUILD' as OrchestrationStep,
      actor: 'Orchestrator' as SubAgentType,
      inputs_summary: formatContextBuildInputsZh(request.message, tripCtx),
      outputs_summary: `上下文包构建失败：${msg || '未知错误'}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: { duration_ms: Date.now() - stepStartTime, error: true },
    });
    state.metadata.last_updated_at = new Date().toISOString();
    return decisionState;
  }
}
