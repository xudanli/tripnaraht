import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type {
  AgentContext,
  OrchestrationResult,
} from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { GraphRunOutcome } from '../orchestration-graph.types';
import type { GateEvalPrePlanSegmentInput } from './base.node';

export interface GateEvalNodeHost {
  readonly logger: Logger;

  touchAsyncTaskProgress(step: string): void;

  executeGateEvalPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined>;

  relaxGateForPartialIfEligible(state: OrchestratorState): void;

  applyMarathonPipelineSignals(state: OrchestratorState, request: RouteAndRunRequestDto): void;

  maybeStartGuardiansDebateShadowAfterGate(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
  ): void;

  maybeAwaitGuardiansDebateFuseAndShortCircuit(
    request: RouteAndRunRequestDto,
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    context: AgentContext,
    startTime: number,
    deadline?: { remainingMs: () => number },
  ): Promise<OrchestrationResult | null>;

  maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void;

  recordPoiPlanningOutcomeAfterItinerary(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): void;

  buildBlockedResult(
    state: OrchestratorState,
    startTime: number,
    decisionState: DecisionState | undefined,
    context: AgentContext,
  ): OrchestrationResult;

  isGateBlocked(state: OrchestratorState): boolean;
}

export type GateEvalPrePlanSegmentResult =
  | { kind: 'continue'; decisionState: DecisionState | undefined }
  | GraphRunOutcome;
