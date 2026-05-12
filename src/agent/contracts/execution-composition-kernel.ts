// src/agent/contracts/execution-composition-kernel.ts
/**
 * Trace 组合（v1）：**部分**运算 ⊕；无启发式、无 runtime、无 enrich。
 * §16 切片无双段链 / overlay 载荷时，sequential / overlay **未定义**（返回 null）。
 * @see src/agent/runtime/specs/execution-algebra.spec.md §13
 */
import type { OrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';
import { SemanticFixedPointKernel } from './semantic-fixed-point-kernel';

export const ExecutionCompositionKernel = {
  /**
   * 冲突自由合并：**仅当** `A ~ B` 时有定义；结果为左操作元（确定性代表元）。
   * 不发明字段、不改变等价类。
   */
  conflictFreeMerge(
    a: OrchestrationExecutionTraceV1,
    b: OrchestrationExecutionTraceV1,
  ): OrchestrationExecutionTraceV1 | null {
    if (!SemanticFixedPointKernel.isFixedPointTraces(a, b)) return null;
    return a;
  },

  /** v1：§16 未承载顺序链组合 → 未定义 */
  sequentialCompose(_a: OrchestrationExecutionTraceV1, _b: OrchestrationExecutionTraceV1): OrchestrationExecutionTraceV1 | null {
    return null;
  },

  /** v1：§16 未承载 overlay 合并语义 → 未定义 */
  overlayCompose(_a: OrchestrationExecutionTraceV1, _b: OrchestrationExecutionTraceV1): OrchestrationExecutionTraceV1 | null {
    return null;
  },

  /**
   * v1 默认 ⊕：**同** `conflictFreeMerge`（部分半群在「同等价类」上的左投影）。
   */
  compose(a: OrchestrationExecutionTraceV1, b: OrchestrationExecutionTraceV1): OrchestrationExecutionTraceV1 | null {
    return this.conflictFreeMerge(a, b);
  },
};
