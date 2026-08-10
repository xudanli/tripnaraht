/**
 * ROR 冻结后 ASK_USER 短路（Reflect 缺口话术闭环）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type {
  OrchestrationStep,
  SubAgentType,
} from '../interfaces/trip-plan.interface';
import type { RorRealitySnapshot } from '../reality-observation/reality-observation.types';
import {
  formatAskClarificationMessage,
  selectAskCards,
} from '../reality-observation/reflect-ask-prompt.util';
import { serializeRorSnapshotForObservability } from '../reality-observation/reality-snapshot.freeze';

export function buildRorAskUserResult(input: {
  request: RouteAndRunRequestDto;
  snapshot: RorRealitySnapshot;
  startTime: number;
}): OrchestrationResult {
  const { request, snapshot, startTime } = input;
  const cards =
    snapshot.askCards?.length
      ? snapshot.askCards
      : selectAskCards(snapshot.unknowns, {
          operation: snapshot.operation,
          scope: snapshot.scope,
          needs: [],
          completionCriteria: [],
          safetyFloorKeys: [],
          maxReflectRounds: 2,
        });

  const clarificationMessage =
    snapshot.clarificationMessage?.trim() ||
    formatAskClarificationMessage({
      operation: snapshot.operation,
      cards,
    });

  const asks = snapshot.unknowns.filter((u) => u.mustAskUser);

  return {
    success: false,
    status: 'NEED_USER_INPUT',
    technicalSuccess: true,
    userTaskCompleted: false,
    result: {
      needsUserConfirmation: true,
      clarificationMessage,
      missingParams: cards.map((c) => c.key),
      askCards: cards,
      realityObservationSnapshot: serializeRorSnapshotForObservability(snapshot),
      solutions: cards.map((c) => c.promptZh),
      reflectAskClosedLoop: true,
    },
    answerText: clarificationMessage,
    stepsExecuted: [],
    totalDuration: Date.now() - startTime,
    decisionLog: [
      {
        request_id: request.request_id,
        step: 'INTAKE' as OrchestrationStep,
        actor: 'Orchestrator' as SubAgentType,
        inputs_summary: `用户请求: ${request.message}`,
        outputs_summary: `ROR ASK_USER: ${cards.map((a) => a.key).join(', ') || asks.map((a) => a.key).join(', ')}`,
        evidence_refs: [],
        timestamp: new Date().toISOString(),
        metadata: {
          reality_observation_snapshot: serializeRorSnapshotForObservability(snapshot),
          ask_cards: cards,
          reflect_ask_closed_loop: true,
        },
      },
    ],
  };
}
