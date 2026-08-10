/**
 * Planning 状态机路径宿主：图执行 / Kernel / 写回仍挂在 ClaudeOrchestrator。
 */

import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { LlmProvider } from '../../llm/dto/llm-request.dto';
import type { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { OrchestrateEntryDeadline } from './orchestrate-entry.host';

export interface PlanningStateMachineHost {
  readonly logger: Pick<Logger, 'log' | 'warn' | 'debug' | 'error'>;
  readonly configService?: ConfigService;
  readonly decisionKernel?: DecisionKernelService;
  readonly graphEffectivePlanMaterializer?: unknown;
  /** 体能提交状态等 SM 入口短路读库 */
  readonly prisma?: unknown;

  getLlmProvider(request: RouteAndRunRequestDto): LlmProvider;
  isKernelEnabledForRequest(request: RouteAndRunRequestDto): boolean;
  kernelCreateInitialOpts(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): unknown;
  mergeGovernanceRuntimeBranchDirective(
    request: RouteAndRunRequestDto,
    decisionState: DecisionState,
  ): DecisionState;
  computeResumeHarnessEntryFromLast(...args: any[]): any;
  asPrePlanGraphHost(): any;
  asPlanVerifyLoopHost(): any;
  asPostPlanGraphHost(): any;
  runPlanGenWithEmptyDraftGuard(...args: any[]): Promise<any>;
  runTravelCompilePhaseIfEnabled(...args: any[]): Promise<any>;
  maybeAutoApplyItineraryAdjustCorridor(state: OrchestratorState): Promise<void>;
  maybeSnapshot(...args: any[]): Promise<any>;
  enrichOrchestrationResultWithFullTripReplanHotel(
    ...args: any[]
  ): Promise<OrchestrationResult> | OrchestrationResult;
  buildSuccessResult(...args: any[]): OrchestrationResult;
  buildErrorResult(...args: any[]): OrchestrationResult;
  orchestrateWorkbenchAssistantPlaceholder(
    request: RouteAndRunRequestDto,
    context: AgentContext,
    startTime: number,
  ): Promise<OrchestrationResult>;
}

export type { OrchestrateEntryDeadline, AgentContext, OrchestrationResult, DecisionState };
