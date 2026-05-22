import type { Logger } from '@nestjs/common';
import type { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

export interface RunContextBuildPhaseParams {
  request: RouteAndRunRequestDto;
  context: AgentContext;
  state: OrchestratorState;
  decisionState: DecisionState | undefined;
}

/** Agent memory 只读窥视（Host 侧注入，节点不直接依赖 Store） */
export interface ContextBuildMemoryPort {
  getTravelerNationality(): string | undefined;
}

/**
 * CONTEXT_BUILD 阶段宿主：DSO → Context Package，供 PLAN_GEN 纯净视界。
 */
export interface ContextBuildPhaseHost {
  readonly logger: Logger;

  readonly decisionKernel?: DecisionKernelService;

  readonly memoryPort?: ContextBuildMemoryPort;

  extractCountryCodeFromMessage(message: string): string | undefined;
}
