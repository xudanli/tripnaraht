import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { GateResult, OrchestratorState } from '../../../interfaces/trip-plan.interface';
export interface RunVerifyPhaseParams {
  decisionState: DecisionState | undefined;
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  context: AgentContext;
  llmProvider: LlmProvider;
}

export interface VerifyPhaseHost {
  readonly logger: Logger;

  isKernelNativeExecution(ctx: { request_id: string; user_id?: string }): boolean;

  readonly decisionKernel?: DecisionKernelService;

  syncOrchestratorFromDecisionState(newState: DecisionState, state: OrchestratorState): void;

  mergeVerificationIssuesIntoGateResult(
    gateResult: GateResult,
    issues: unknown[],
  ): GateResult | null;

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

  executeVerifyStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    llmProvider: LlmProvider,
  ): Promise<void>;
}
