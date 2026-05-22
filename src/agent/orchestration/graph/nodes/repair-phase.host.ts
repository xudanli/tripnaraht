import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { Itinerary, OrchestratorState } from '../../../interfaces/trip-plan.interface';

export interface RunRepairPhaseParams {
  decisionState: DecisionState | undefined;
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  context: AgentContext;
  llmProvider: LlmProvider;
}

export interface RepairPhaseHost {
  readonly logger: Logger;

  isKernelNativeExecution(ctx: { request_id: string; user_id?: string }): boolean;

  readonly decisionKernel?: DecisionKernelService;

  syncOrchestratorFromDecisionState(newState: DecisionState, state: OrchestratorState): void;

  applyPostRepairRoutingSync(params: {
    trip: OrchestratorState['trip_plan_request'];
    itinerary: Itinerary;
    metadata: Record<string, unknown>;
    message?: string;
    routeAndRunIntent?: unknown;
    clarificationAnswers?: unknown;
  }): { trip: OrchestratorState['trip_plan_request'] };

  generateDecisionStepForStep(
    state: OrchestratorState,
    step: import('../../../interfaces/trip-plan.interface').OrchestrationStep,
    actor: import('../../../interfaces/trip-plan.interface').SubAgentType,
  ): Promise<void>;

  executePhaseViaKernel(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    phase: string,
    run: () => Promise<void>,
  ): Promise<DecisionState | undefined>;

  executeRepairStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    llmProvider: LlmProvider,
  ): Promise<void>;

  /** REPAIR 后 best-effort 审计 / 指标（不改变控制流） */
  recordRepairObservability(params: {
    newState: DecisionState;
    state: OrchestratorState;
    request: RouteAndRunRequestDto;
  }): Promise<void>;
}
