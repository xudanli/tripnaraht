import { runPlanVerifyOptimizeRepairGraph } from './plan-verify-loop.graph';
import type { PlanVerifyLoopHost } from './plan-verify-loop.host';
import type { PlanVerifyLoopOutcome, PlanVerifyLoopRunParams } from './plan-verify-loop.types';

/**
 * OPTIMIZE → VERIFY →（FATAL/REPAIR/收敛守卫）子图（Phase 2：经 OrchestrationGraphScheduler）。
 * PLAN_GEN 与空草案守卫由 `host.runPlanGenWithEmptyDraftGuard` 在编排入口先执行。
 */
export async function runPlanVerifyOptimizeRepairLoop(
  host: PlanVerifyLoopHost,
  params: PlanVerifyLoopRunParams,
): Promise<PlanVerifyLoopOutcome> {
  return runPlanVerifyOptimizeRepairGraph(host, params);
}
