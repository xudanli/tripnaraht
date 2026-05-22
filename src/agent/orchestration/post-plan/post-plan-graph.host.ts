import type { OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import type { AgentContext } from '../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { RunFeedbackPhaseParams } from './feedback-phase.host';
import type { RunHallucinationPhaseParams } from './hallucination-phase.host';
import type { NarrateNodeHost } from './narrate-node.host';

/**
 * post_plan 子图宿主：NARRATE + FEEDBACK + hallucination + 终端结果组装。
 */
export interface PostPlanGraphHost extends NarrateNodeHost {
  runFeedbackPhase(params: RunFeedbackPhaseParams): Promise<DecisionState | undefined>;

  runHallucinationPhase(params: RunHallucinationPhaseParams): Promise<void>;

  buildSuccessResult(
    state: OrchestratorState,
    startTime: number,
    decisionState: DecisionState | undefined,
    context: AgentContext,
  ): OrchestrationResult;
}
