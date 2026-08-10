/**
 * pre_plan 全链：intake → context_build 顺序段执行（从 ClaudeOrchestrator 迁出）。
 */

import type { PrePlanFullChainHost } from './pre-plan-full-chain.host';
import type { PrePlanGraphRunParams } from './pre-plan-graph.types';
import type {
  GraphRunOutcome,
  OrchestrationNodeId,
  OrchestrationTerminalId,
} from './orchestration-graph.types';
import type { OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import { PRE_PLAN_NODE_ORDER } from './pre-plan-graph.runner';

export async function runPrePlanFullChain(
  host: PrePlanFullChainHost,
  params: PrePlanGraphRunParams,
): Promise<GraphRunOutcome> {
  const { request, context, state, llmProvider, startTime, resumeSkipIntake, stopAfter } = params;
  let decisionState = params.decisionState;
  const startAt = params.entry ?? 'intake';
  const shouldRun = (node: OrchestrationNodeId) =>
    PRE_PLAN_NODE_ORDER.indexOf(node) >= PRE_PLAN_NODE_ORDER.indexOf(startAt);

  const maybeStopAfter = (
    node: OrchestrationNodeId,
  ): GraphRunOutcome | null => {
    if (stopAfter && stopAfter === node) {
      return { kind: 'completed', lastNode: node, decisionState };
    }
    return null;
  };

  const prePlanTerminal = (
    terminal: OrchestrationTerminalId,
    result: OrchestrationResult,
  ): GraphRunOutcome => ({
    kind: 'terminal',
    terminal,
    result,
    decisionState,
  });

  if (shouldRun('intake')) {
    const intakeSegment = await host.getIntakeNode().runPrePlanSegment({
      request,
      context,
      state,
      decisionState,
      llmProvider,
      startTime,
      resumeSkipIntake,
      systemRequestId: state.request_id,
      logger: host.logger,
      prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
    });
    if (intakeSegment.kind !== 'continue') {
      return intakeSegment;
    }
    decisionState = intakeSegment.decisionState;
  }

  if (shouldRun('state_update')) {
    const stateUpdateSegment = await host.getStateUpdateNode().runPrePlanSegment({
      request,
      context,
      state,
      decisionState,
      llmProvider,
      startTime,
      systemRequestId: state.request_id,
      logger: host.logger,
      prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
    });
    if (stateUpdateSegment.kind !== 'continue') {
      return stateUpdateSegment;
    }
    decisionState = stateUpdateSegment.decisionState;
  }

  if (shouldRun('research')) {
    const researchSegment = await host.getResearchNode().runPrePlanSegment({
      request,
      context,
      state,
      decisionState,
      llmProvider,
      startTime,
      systemRequestId: state.request_id,
      logger: host.logger,
      prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
    });
    if (researchSegment.kind !== 'continue') {
      return researchSegment;
    }
    decisionState = researchSegment.decisionState;
  }

  if (shouldRun('poi_selection')) {
    const poiSegment = await host.getPoiSelectionNode().runPrePlanSegment({
      request,
      context,
      state,
      decisionState,
      llmProvider,
      startTime,
      systemRequestId: state.request_id,
      logger: host.logger,
      prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
    });
    if (poiSegment.kind !== 'continue') {
      return poiSegment;
    }
    decisionState = poiSegment.decisionState;
  }

  if (shouldRun('gate_eval')) {
    const gateSegment = await host.getGateEvalNode().runPrePlanSegment({
      request,
      context,
      state,
      decisionState,
      llmProvider,
      startTime,
      deadline: params.deadline,
      systemRequestId: state.request_id,
      logger: host.logger,
      prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
    });
    if (gateSegment.kind !== 'continue') {
      return gateSegment;
    }
    decisionState = gateSegment.decisionState;
  }

  if (shouldRun('context_build')) {
    const contextBuildSegment = await host.getContextBuildNode().runPrePlanSegment({
      request,
      context,
      state,
      decisionState,
      llmProvider,
      startTime,
      systemRequestId: state.request_id,
      logger: host.logger,
      prePlan: { startTime, stopAfter, maybeStopAfter, prePlanTerminal },
    });
    if (contextBuildSegment.kind !== 'continue') {
      return contextBuildSegment;
    }
    decisionState = contextBuildSegment.decisionState;
  }

  return { kind: 'completed', lastNode: 'context_build', decisionState };
}
