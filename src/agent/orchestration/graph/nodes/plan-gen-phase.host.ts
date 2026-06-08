import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { Itinerary, OrchestratorState } from '../../../interfaces/trip-plan.interface';

export interface RunPlanGenPhaseParams {
  decisionState: DecisionState | undefined;
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  context: AgentContext;
  llmProvider: LlmProvider;
}

export interface PlanGenPhaseHost {
  readonly logger: Logger;

  isKernelNativeExecution(ctx: { request_id: string; user_id?: string }): boolean;

  readonly decisionKernel?: DecisionKernelService;

  syncOrchestratorFromDecisionState(newState: DecisionState, state: OrchestratorState): void;

  syncPlanRoutingMetricsToTripPlan(
    trip: OrchestratorState['trip_plan_request'],
    itinerary: Itinerary,
  ): OrchestratorState['trip_plan_request'];

  generateDecisionStepForStep(
    state: OrchestratorState,
    step: import('../../../interfaces/trip-plan.interface').OrchestrationStep,
    actor: import('../../../interfaces/trip-plan.interface').SubAgentType,
  ): Promise<void>;

  collectTrajectoryAfterPlanGen(params: {
    request: RouteAndRunRequestDto;
    state: OrchestratorState;
  }): Promise<void>;

  /** PR-D：PLAN_GEN 产出首轮行程后冻结拓扑快照 */
  onPlanGenDraftCaptured?(requestId: string, itinerary: Itinerary): void;

  executePhaseViaKernel(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    phase: string,
    run: () => Promise<void>,
  ): Promise<DecisionState | undefined>;

  executePlanGenStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    llmProvider: LlmProvider,
  ): Promise<void>;

  /** ITINERARY_ADJUST：PLAN_GEN 产出草案后执行 itinerary.adaptive_replan */
  runAdaptiveReplanAfterPlanGen?(state: OrchestratorState): Promise<boolean>;
}
