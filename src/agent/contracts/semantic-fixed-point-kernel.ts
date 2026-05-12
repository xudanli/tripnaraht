// src/agent/contracts/semantic-fixed-point-kernel.ts
/**
 * 语义不动点（pair 收敛）：**仅**判断当前一对观测是否已在标准形下重合；无新状态、无预测、无 runtime。
 * @see semantic-validation-contract.md §23
 */
import type { CanonicalExecutionTraceV1 } from './canonical-execution-trace-v1.types';
import {
  canonicalExecutionTraceStableJson,
  ExecutionNormalizationKernel,
  isOrchestrationExecutionTraceV1Schema,
} from './execution-normalization-kernel';
import type { OrchestrationExecutionTraceV1 } from './orchestration-execution-trace-v1.types';

export const SemanticFixedPointKernel = {
  /**
   * 两标准形是否完全一致（身份 / 决策 / 结构稳定性均编码于 §22 canonical）。
   */
  isFixedPointCanonical(normalizedA: CanonicalExecutionTraceV1, normalizedB: CanonicalExecutionTraceV1): boolean {
    return canonicalExecutionTraceStableJson(normalizedA) === canonicalExecutionTraceStableJson(normalizedB);
  },

  /**
   * 两 §16 trace 是否在 normalize 后收敛为同一点（合法 schema 前提；否则 `false`）。
   * v1 下与 `ExecutionEquivalenceKernel.isSemanticallyEquivalent` 同判。
   */
  isFixedPointTraces(traceA: OrchestrationExecutionTraceV1, traceB: OrchestrationExecutionTraceV1): boolean {
    if (!isOrchestrationExecutionTraceV1Schema(traceA) || !isOrchestrationExecutionTraceV1Schema(traceB)) return false;
    return this.isFixedPointCanonical(
      ExecutionNormalizationKernel.normalizeExecutionTrace(traceA),
      ExecutionNormalizationKernel.normalizeExecutionTrace(traceB),
    );
  },
};
