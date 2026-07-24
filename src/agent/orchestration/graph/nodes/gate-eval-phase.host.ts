import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

export interface RunGateEvalPhaseParams {
  decisionState: DecisionState | undefined;
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  context: AgentContext;
  llmProvider: LlmProvider;
}

/**
 * GATE_EVAL 阶段宿主：Kernel Harness 硬阻断在 {@link DecisionKernelService.executeGateEval} 内合成 BLOCK，不调用 gateEvalExecutor。
 */
export interface GateEvalPhaseHost {
  readonly logger: Logger;

  isKernelNativeExecution(ctx: { request_id: string; user_id?: string }): boolean;

  readonly decisionKernel?: DecisionKernelService;

  syncOrchestratorFromDecisionState(newState: DecisionState, state: OrchestratorState): void;

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

  executeGateEvalStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    llmProvider: LlmProvider,
  ): Promise<void>;

  enrichGuardianDebateTripContextAfterGateEval(state: OrchestratorState): void;

  applyMarathonPipelineSignals(state: OrchestratorState, request: RouteAndRunRequestDto): void;

  /** PR-A：GATE_EVAL 完成后写入 DecisionTrajectory 草稿（可选）。 */
  onGateEvalCompleted?(state: OrchestratorState, request: RouteAndRunRequestDto): Promise<void>;
}
