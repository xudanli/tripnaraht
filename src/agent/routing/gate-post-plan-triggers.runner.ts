/**
 * Gate 通过后自动推送 Decision Profiling / Process Fairness（从 ClaudeOrchestrator 迁出）。
 */

import type { GatePostPlanTriggersHost } from './gate-post-plan-triggers.host';
import type { DecisionProfilingOrchestrationHint } from '../../trips/decision-profiling/types/decision-profiling-orchestration.types';
import type { ProcessFairnessOrchestrationHint } from '../../trips/process-fairness/types/process-fairness-orchestration.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';

/**
 * PDI-4：Gate 通过后、PLAN 前，对未完成 Travel Style / Money DNA 调查的成员自动推送问卷入口。
 */
export async function maybeTriggerDecisionProfilingQuiz(
  host: GatePostPlanTriggersHost,
  request: RouteAndRunRequestDto,
  state: OrchestratorState,
): Promise<void> {
  if (!host.decisionProfilingOrchestrator) return;

  const tripId = (request.trip_id || state.metadata?.tripId || '').trim();
  const userId = (request.user_id || state.metadata?.userId || '').trim();
  if (!tripId || !userId) return;

  try {
    const hint: DecisionProfilingOrchestrationHint =
      await host.decisionProfilingOrchestrator.tryAutoPromptQuiz({
        tripId,
        userId,
        message: request.message ?? '',
      });

    if (!hint.triggered) return;

    (state.metadata as Record<string, unknown>).decision_profiling = hint;
    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Orchestrator',
      inputs_summary: `decision_profiling auto-prompt step=${hint.nextStep}`,
      outputs_summary: `prompt_kind=${hint.promptKind}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'DECISION_PROFILING_QUIZ_PROMPTED',
        next_step: hint.nextStep,
        prompt_kind: hint.promptKind,
        team_completion_rate: hint.onboarding.teamCompletionRate,
        client_navigation: hint.clientNavigation,
      },
    });

    if (hint.agentIntroZh) {
      const prev = state.narration?.user_friendly_summary ?? '';
      state.narration = {
        day_by_day_narrative: state.narration?.day_by_day_narrative ?? [],
        highlights: state.narration?.highlights ?? [],
        tips: state.narration?.tips ?? [],
        ...state.narration,
        user_friendly_summary: prev
          ? `${prev}\n\n${hint.agentIntroZh}`
          : hint.agentIntroZh,
      };
    }
  } catch (e: any) {
    host.logger.warn(
      `[Claude Orchestrator] decision_profiling auto-prompt skipped: ${e?.message ?? e}`,
    );
  }
}

/**
 * F3.1：Gate 通过后、PLAN 前，对多人行程在检测到关键决策节点时自动发起偏好分享轮次。
 */
export async function maybeTriggerProcessFairnessRound(
  host: GatePostPlanTriggersHost,
  request: RouteAndRunRequestDto,
  state: OrchestratorState,
): Promise<void> {
  if (!host.preferenceRoundOrchestrator) return;

  const tripId = (request.trip_id || state.metadata?.tripId || '').trim();
  const userId = (request.user_id || state.metadata?.userId || '').trim();
  if (!tripId || !userId) return;

  try {
    const hint: ProcessFairnessOrchestrationHint =
      await host.preferenceRoundOrchestrator.tryAutoStartForRequest({
        tripId,
        userId,
        message: resolveRouteAndRunUserMessage(request),
      });

    if (!hint.triggered) return;

    (state.metadata as Record<string, unknown>).process_fairness = hint;
    state.decision_log.push({
      request_id: state.request_id,
      step: 'GATE_EVAL',
      actor: 'Orchestrator',
      inputs_summary: `process_fairness auto-start node=${hint.decisionNode}`,
      outputs_summary: `round_id=${hint.roundId}`,
      evidence_refs: [],
      timestamp: new Date().toISOString(),
      metadata: {
        system_action: 'PROCESS_FAIRNESS_ROUND_STARTED',
        decision_node: hint.decisionNode,
        round_id: hint.roundId,
        client_navigation: hint.clientNavigation,
      },
    });

    if (hint.agentIntroZh) {
      const prev = state.narration?.user_friendly_summary ?? '';
      state.narration = {
        day_by_day_narrative: state.narration?.day_by_day_narrative ?? [],
        highlights: state.narration?.highlights ?? [],
        tips: state.narration?.tips ?? [],
        ...state.narration,
        user_friendly_summary: prev
          ? `${prev}\n\n${hint.agentIntroZh}`
          : hint.agentIntroZh,
      };
    }
  } catch (e: any) {
    host.logger.warn(
      `[Claude Orchestrator] process_fairness auto-start skipped: ${e?.message ?? e}`,
    );
  }
}
