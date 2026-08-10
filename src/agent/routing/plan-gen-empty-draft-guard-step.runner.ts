/**
 * PLAN_GEN 执行 + empty draft 终端守卫（从 ClaudeOrchestrator 迁出）。
 */

import type { PlanGenEmptyDraftGuardStepHost } from './plan-gen-empty-draft-guard-step.host';
import {
  tryPlanGenEmptyDraftTerminal,
  type PlanGenWithEmptyDraftResult,
  type PlanVerifyLoopRunParams,
} from '../orchestration/plan-verify-loop';

export async function runPlanGenWithEmptyDraftGuard(
  host: PlanGenEmptyDraftGuardStepHost,
  params: PlanVerifyLoopRunParams,
): Promise<PlanGenWithEmptyDraftResult> {
  host.touchAsyncTaskProgress('PLAN_GEN');
  let decisionState = await host.executePlanGenPhase(
    params.decisionState,
    params.state,
    params.request,
    params.context,
    params.llmProvider,
  );
  host.maybeSnapshot(params.state, 'AUTO');
  const terminal = await tryPlanGenEmptyDraftTerminal(host.asPlanGenEmptyDraftGuardHost(), {
    request: params.request,
    context: params.context,
    state: params.state,
    decisionState,
    startTime: params.startTime,
  });
  if (terminal) {
    return { decisionState, terminal };
  }
  return { decisionState };
}
