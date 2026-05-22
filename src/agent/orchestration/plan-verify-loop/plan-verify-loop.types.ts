import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

/** PLAN_GEN → OPTIMIZE → VERIFY → REPAIR 子图出口 */
export type PlanVerifyLoopOutcome =
  | {
      kind: 'continue';
      decisionState: DecisionState | undefined;
    }
  | {
      /** VERIFY Harness L2 → 回到 pre_plan 的 research（Phase 3） */
      kind: 'reroute_pre_plan';
      entry: 'research';
      decisionState: DecisionState | undefined;
    }
  | {
      kind: 'terminal';
      result: OrchestrationResult;
      decisionState: DecisionState | undefined;
    };

export interface PlanVerifyLoopRunParams {
  request: RouteAndRunRequestDto;
  context: AgentContext;
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
  llmProvider: LlmProvider;
  startTime: number;
}

export interface PlanGenWithEmptyDraftResult {
  decisionState: DecisionState | undefined;
  terminal?: OrchestrationResult;
}

export interface PlanGenEmptyDraftGuardParams {
  request: RouteAndRunRequestDto;
  context: AgentContext;
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
  startTime: number;
}
