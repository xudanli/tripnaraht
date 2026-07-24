import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { ResearchTeamAuditEntry } from '../../../teams/research/research-team.types';

export interface ResearchPriorSnapshotPort {
  load(request: RouteAndRunRequestDto): Promise<Record<string, unknown> | null | undefined>;
  save(request: RouteAndRunRequestDto, data: Record<string, unknown>): Promise<void>;
}

/** Kernel / 降级路径 RESEARCH 执行宿主 */
export interface ResearchPhaseHost {
  readonly logger: Logger;
  isKernelNativeExecution(ctx: { request_id: string; user_id?: string }): boolean;
  readonly decisionKernel?: DecisionKernelService;
  readonly researchPriorSnapshot?: ResearchPriorSnapshotPort;
  clearResearchAtomicPendingMetadata(state: OrchestratorState): void;
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
  executeResearchStep(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    state: OrchestratorState,
    llmProvider: LlmProvider,
    decisionState: DecisionState | undefined,
  ): Promise<void>;
}

export interface RunResearchPhaseParams {
  decisionState: DecisionState | undefined;
  state: OrchestratorState;
  request: RouteAndRunRequestDto;
  context: AgentContext;
  llmProvider: LlmProvider;
}
