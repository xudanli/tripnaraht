import type { OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PlanVerifyLoopOutcome } from './plan-verify-loop.types';

export function parseMaxVerifyResearchRetries(): number {
  const n = parseInt(process.env.DECISION_MAX_VERIFY_RESEARCH_RETRIES ?? '1', 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

export interface VerifyReturnToResearchRetryAttempt {
  decisionState: DecisionState | undefined;
  retryIndex: number;
  maxRetries: number;
}

export interface VerifyReturnToResearchRetryAttemptResult {
  planVerifyOutcome: PlanVerifyLoopOutcome;
  decisionState: DecisionState | undefined;
  prePlanTerminal?: OrchestrationResult;
  planGenTerminal?: OrchestrationResult;
}

export interface VerifyReturnToResearchRetryParams {
  state: OrchestratorState;
  planVerifyOutcome: PlanVerifyLoopOutcome;
  decisionState: DecisionState | undefined;
  maxRetries?: number;
  onRetry: (attempt: VerifyReturnToResearchRetryAttempt) => Promise<VerifyReturnToResearchRetryAttemptResult>;
  onRetryStarted?: (retryIndex: number, maxRetries: number) => void;
}

export interface VerifyReturnToResearchRetryResult {
  planVerifyOutcome: PlanVerifyLoopOutcome;
  decisionState: DecisionState | undefined;
  terminal?: OrchestrationResult;
}

/**
 * VERIFY Harness `RETURN_TO_RESEARCH` 后：pre_plan(research) → plan_gen → plan_verify 重试环。
 * 由 `ClaudeOrchestratorService` 注入 `onRetry` 调用真实图 runner。
 */
export async function runVerifyReturnToResearchRetryLoop(
  params: VerifyReturnToResearchRetryParams,
): Promise<VerifyReturnToResearchRetryResult> {
  let { planVerifyOutcome, decisionState, state } = params;
  const maxRetries = params.maxRetries ?? parseMaxVerifyResearchRetries();
  let verifyResearchRetries = Number(
    (state.metadata as Record<string, unknown>)?.verify_return_to_research_count ?? 0,
  );

  while (
    planVerifyOutcome.kind === 'reroute_pre_plan' &&
    maxRetries > 0 &&
    verifyResearchRetries < maxRetries
  ) {
    verifyResearchRetries += 1;
    (state.metadata as Record<string, unknown>).verify_return_to_research_count =
      verifyResearchRetries;
    params.onRetryStarted?.(verifyResearchRetries, maxRetries);

    const retry = await params.onRetry({
      decisionState: planVerifyOutcome.decisionState,
      retryIndex: verifyResearchRetries,
      maxRetries,
    });

    if (retry.prePlanTerminal) {
      return { planVerifyOutcome, decisionState, terminal: retry.prePlanTerminal };
    }
    decisionState = retry.decisionState ?? decisionState;
    if (retry.planGenTerminal) {
      return { planVerifyOutcome, decisionState, terminal: retry.planGenTerminal };
    }
    planVerifyOutcome = retry.planVerifyOutcome;
    decisionState = retry.decisionState ?? decisionState;
  }

  return { planVerifyOutcome, decisionState };
}
