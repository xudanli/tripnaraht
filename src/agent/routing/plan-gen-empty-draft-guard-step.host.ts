/**
 * PLAN_GEN + empty-draft terminal guard 宿主。
 */

import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AgentContext } from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { PlanGenEmptyDraftGuardHost } from '../orchestration/plan-verify-loop';

export interface PlanGenEmptyDraftGuardStepHost {
  touchAsyncTaskProgress(step: string): void;
  maybeSnapshot(
    state: OrchestratorState,
    trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT',
  ): void;
  executePlanGenPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined>;
  asPlanGenEmptyDraftGuardHost(): PlanGenEmptyDraftGuardHost;
}
