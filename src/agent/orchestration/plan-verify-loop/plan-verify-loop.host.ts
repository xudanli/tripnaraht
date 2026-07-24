import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { LlmProvider } from '../../../llm/dto/llm-request.dto';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { VerifyPhaseResult } from '../graph/nodes/verify-verdict.types';
import type { PlanVerifyLoopRepairGuardHost } from './plan-verify-loop-repair-guards';
import type {
  PlanGenEmptyDraftGuardParams,
  PlanGenWithEmptyDraftResult,
  PlanVerifyLoopRunParams,
} from './plan-verify-loop.types';

/**
 * `ClaudeOrchestratorService` 暴露给 plan-verify-loop 控制流胶水的最小宿主面。
 */
export interface PlanVerifyLoopHost extends PlanVerifyLoopRepairGuardHost {
  touchAsyncTaskProgress(phase: string): void;
  maybeSnapshot(state: OrchestratorState, kind: string): void;

  executePlanGenPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined>;

  tryPlanGenEmptyDraftTerminal(params: PlanGenEmptyDraftGuardParams): Promise<OrchestrationResult | null>;

  runOptimizePhase(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): Promise<DecisionState | undefined>;

  runVerifyPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<VerifyPhaseResult>;

  syncConfidenceAfterVerify(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
  ): DecisionState | undefined;

  buildErrorResult(
    state: OrchestratorState,
    error: Error,
    startTime: number,
    decisionState: DecisionState | undefined,
    step: string,
    extra?: unknown,
    context?: AgentContext,
  ): OrchestrationResult;

  runRepairPhase(
    decisionState: DecisionState | undefined,
    state: OrchestratorState,
    request: RouteAndRunRequestDto,
    context: AgentContext,
    llmProvider: LlmProvider,
  ): Promise<DecisionState | undefined>;

  /** PLAN_GEN + 空草案守卫（编排入口） */
  runPlanGenWithEmptyDraftGuard(params: PlanVerifyLoopRunParams): Promise<PlanGenWithEmptyDraftResult>;

  applyReturnToResearchInvalidation(
    state: OrchestratorState,
    decisionState: DecisionState | undefined,
    request: RouteAndRunRequestDto,
  ): Promise<DecisionState | undefined>;

  /** L2 RETURN_TO_RESEARCH 跳出子图前闭合/落盘 Harness trace */
  persistHarnessTraceOnReturnToResearch(decisionState: DecisionState | undefined): void;
}
