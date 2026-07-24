import type { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import { shouldFinalizeHarnessTraceOnOrchestrationExit } from '../../../harness/tracing/harness-trace-mode.util';

/**
 * VERIFY `RETURN_TO_RESEARCH` 出口：闭合/落盘 Harness 轨迹。
 * - `on-failure`：Kernel VERIFY 失败点已 `retrofitTrajectoryOnFailure` + 可选落盘；此处仅 `full` 模式补收口。
 * - `full`：将仍开放的 active trace 标为 BLOCKED 并尝试 export。
 */
export function persistHarnessTraceOnPlanVerifyReturnToResearch(
  decisionKernel: DecisionKernelService | undefined,
  decisionState: DecisionState | undefined,
): void {
  if (!decisionKernel || !decisionState) return;
  if (!shouldFinalizeHarnessTraceOnOrchestrationExit()) return;
  decisionKernel.finalizeHarnessTraceIfRecorded(decisionState, 'BLOCKED');
}
