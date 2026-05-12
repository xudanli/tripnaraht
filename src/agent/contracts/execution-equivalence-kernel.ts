// src/agent/contracts/execution-equivalence-kernel.ts
/**
 * 语义执行等价判定（仅 boolean）：trace-only；无 taxonomy、无 runtime、无 drift 分类。
 * v1 实现委托 **§23** 不动点核对（pair 收敛 = 等价类）。
 * @see semantic-validation-contract.md §21
 */
import type { OrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { SemanticFixedPointKernel } from './semantic-fixed-point-kernel';

export { stripEquivalenceNoise } from './execution-normalization-kernel';

export const ExecutionEquivalenceKernel = {
  /**
   * 是否属于同一语义执行等价类。
   * **禁止：** drift 类型学、模糊匹配、runtime 状态、ML。
   */
  isSemanticallyEquivalent(a: OrchestrationExecutionTraceV1, b: OrchestrationExecutionTraceV1): boolean {
    return SemanticFixedPointKernel.isFixedPointTraces(a, b);
  },
};
