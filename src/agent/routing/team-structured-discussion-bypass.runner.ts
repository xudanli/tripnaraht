/**
 * 团队结构化讨论 / Process Fairness QA_LIGHT bypass（从 ClaudeOrchestrator 迁出）。
 */

import type { TeamStructuredDiscussionBypassHost } from './team-structured-discussion-bypass.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { ProcessFairnessOrchestrationHint } from '../../trips/process-fairness/types/process-fairness-orchestration.types';
import {
  buildProcessFairnessSuggestedOperations,
  buildTeamStructuredDiscussionAnswer,
  primaryDecisionNodeFromMessage,
} from '../utils/team-structured-discussion.util';

export async function orchestrateTeamStructuredDiscussionBypass(
  host: TeamStructuredDiscussionBypassHost,
  request: RouteAndRunRequestDto,
  context: AgentContext,
  message: string,
  startTime: number,
): Promise<OrchestrationResult> {
  const tripId = (context.tripId || request.trip_id || '').trim();
  const userId = (context.userId || request.user_id || '').trim();
  let memberCount = 1;
  let hint: ProcessFairnessOrchestrationHint = {
    triggered: false,
    status: 'SCAFFOLD',
    decisionNode: primaryDecisionNodeFromMessage(message),
    roundId: null,
    round: null,
    agentIntroZh: null,
    clientNavigation: null,
    skippedReason: !userId ? 'missing_user_id' : !host.preferenceRoundOrchestrator ? 'orchestrator_unavailable' : undefined,
  };

  if (host.preferenceRoundOrchestrator && tripId && userId) {
    try {
      memberCount = await host.preferenceRoundOrchestrator.countTripMembers(tripId);
      hint = await host.preferenceRoundOrchestrator.tryAutoStartForRequest({
        tripId,
        userId,
        message,
      });
    } catch (e: any) {
      host.logger.warn(
        `[Claude Orchestrator] team structured discussion orchestrator failed: ${e?.message ?? e}`,
      );
      hint = { ...hint, skippedReason: hint.skippedReason ?? 'orchestrator_error' };
    }
  }

  let tripName: string | null = null;
  if (tripId) {
    try {
      const row = await host.prisma.trip.findUnique({
        where: { id: tripId },
        select: { name: true },
      });
      tripName = row?.name ?? null;
    } catch {
      tripName = null;
    }
  }

  const answerText = buildTeamStructuredDiscussionAnswer({
    message,
    tripName,
    memberCount,
    hint,
  });
  const suggestedOperations = buildProcessFairnessSuggestedOperations(hint);
  const doneAt = Date.now();

  return {
    success: true,
    answerText,
    result: {
      routingDecision: {
        route: 'SYSTEM2_REASONING',
        confidence: 0.92,
        reasoning: 'team_structured_discussion_bypass',
        budget: { max_seconds: 8, max_steps: 0, max_browser_steps: 0 },
        requiredCapabilities: ['process_fairness'],
        consentRequired: false,
        selected_path: 'TEAM_STRUCTURED_DISCUSSION',
      },
      trip_id: tripId,
      ui_surface: 'consultation' as const,
      process_fairness: hint,
      ...(suggestedOperations.length ? { suggested_operations: suggestedOperations } : {}),
      teamStructuredDiscussionBypass: true,
      routingTaskType: context.routingTaskType,
    },
    stepsExecuted: [],
    totalDuration: doneAt - startTime,
    decisionLog: [
      {
        request_id: request.request_id,
        step: 'GATE_EVAL',
        actor: 'Orchestrator',
        inputs_summary: 'team_structured_discussion QA_LIGHT bypass',
        outputs_summary: hint.triggered
          ? `process_fairness round_id=${hint.roundId}`
          : `process_fairness skipped=${hint.skippedReason ?? 'n/a'}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          system_action: hint.triggered
            ? 'PROCESS_FAIRNESS_ROUND_STARTED'
            : 'PROCESS_FAIRNESS_DISCUSSION_SCAFFOLD',
          decision_node: hint.decisionNode,
          round_id: hint.roundId,
          client_navigation: hint.clientNavigation,
        },
      },
    ],
  };
}
