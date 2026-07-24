import type { Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';
import type { GraphRunOutcome } from '../orchestration-graph.types';
import type { PrePlanSegmentControl, ResearchPrePlanSegmentInput } from './base.node';

/**
 * RESEARCH 节点宿主：由 ClaudeOrchestratorService 实现，节点内不直接注入业务 Service 海。
 */
export interface ResearchNodeHost {
  readonly logger: Logger;

  touchAsyncTaskProgress(step: string): void;

  executeResearchPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined>;

  maybeSnapshot(state: OrchestratorState, trigger: 'AUTO' | 'USER_ACTION' | 'CHECKPOINT'): void;

  maybeInterceptDegradedTransportEvidence(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    startTime: number,
    context: AgentContext,
  ): OrchestrationResult | null | undefined;

  clearTransportClarifyReinjectFlag(state: OrchestratorState): void;

  runShadowConflictEarlyWarning(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
  ): Promise<void>;

  applyIntakePredictiveFailureReport(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
  ): void;

  /**
   * HIGH/CRITICAL Early Warning → 澄清终端；返回 terminal outcome 或 null（继续）。
   */
  runEarlyWarningClarificationIntercept(
    input: ResearchPrePlanSegmentInput,
    decisionState: DecisionState | undefined,
  ): Promise<GraphRunOutcome | null>;
}

export type ResearchPrePlanSegmentResult =
  | { kind: 'continue'; decisionState: DecisionState | undefined }
  | GraphRunOutcome;
